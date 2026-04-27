import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth"
import { createClient } from "@/lib/supabase/server"
import { ensureRunning, LifecycleError, type RuntimeEndpoint } from "./lifecycle"
import { signRuntimeJwt } from "./jwt"

/**
 * Resolve the runtime endpoint for a given task, identical to the path the
 * WS upgrade handler takes (ARCHITECTURE §4.1) but for HTTP/REST routes.
 * Returns either the endpoint or a NextResponse describing the failure.
 */
export async function resolveEndpointForTask(
  taskId: string,
): Promise<
  | { ok: true; endpoint: RuntimeEndpoint; userId: string; runtimeJwt: string }
  | { ok: false; response: NextResponse }
> {
  const session = await auth()
  if (!session?.user?.githubId) {
    return { ok: false, response: NextResponse.json({ error: "auth_failed" }, { status: 401 }) }
  }

  const supabase = createClient()
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("github_id", session.user.githubId)
    .single()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "user_not_found" }, { status: 404 }) }
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("id, user_id, codespace_id")
    .eq("id", taskId)
    .single()
  if (!task) {
    return { ok: false, response: NextResponse.json({ error: "task_not_found" }, { status: 404 }) }
  }
  if (task.user_id !== user.id) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  const accessToken = (session.accessToken as string | undefined) ?? ""
  let endpoint: RuntimeEndpoint
  try {
    endpoint = await ensureRunning({
      codespaceId: task.codespace_id ?? null,
      userId: user.id,
      accessToken,
    })
  } catch (err) {
    if (err instanceof LifecycleError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: err.code, message: err.message },
          { status: err.httpStatus },
        ),
      }
    }
    throw err
  }

  return {
    ok: true,
    endpoint,
    userId: user.id,
    runtimeJwt: signRuntimeJwt(user.id),
  }
}

/**
 * Proxy an HTTP request from the browser to the runtime's REST surface.
 * Preserves method + body + content-type; adds Authorization + upstream auth headers.
 */
export async function proxyToRuntime(
  req: NextRequest,
  pathUnderRuntime: string,
  endpoint: RuntimeEndpoint,
  runtimeJwt: string,
): Promise<NextResponse> {
  const url = endpoint.httpUrl + pathUnderRuntime
  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${runtimeJwt}`,
      ...endpoint.headers,
      ...(req.headers.get("content-type")
        ? { "Content-Type": req.headers.get("content-type")! }
        : {}),
    },
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text()
  }

  try {
    const upstream = await fetch(url, init)
    const body = await upstream.text()
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: "runtime_unreachable", message: (err as Error).message },
      { status: 502 },
    )
  }
}
