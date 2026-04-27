import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { resolveEndpointForTask, proxyToRuntime } from "@/lib/agent/http-proxy"

/**
 * HTTP bridge: /api/agent/git/<taskId>/<...path>  →  runtime /<...path>
 *
 * The taskId in the URL scopes the request to a user-owned task; the
 * resolver checks ownership and boots the Codespace if needed (same semantics
 * as /api/agent/ws — see ARCHITECTURE §4.1).
 */
async function handle(
  req: NextRequest,
  ctx: { params: { taskId: string; path: string[] } },
): Promise<NextResponse> {
  const resolved = await resolveEndpointForTask(ctx.params.taskId)
  if (!resolved.ok) return resolved.response

  const tail = ctx.params.path.join("/")
  const qs = req.nextUrl.search // includes leading "?" or ""
  return proxyToRuntime(req, `/git/${tail}${qs}`, resolved.endpoint, resolved.runtimeJwt)
}

export const GET = handle
export const POST = handle
