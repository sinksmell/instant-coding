import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { resolveEndpointForTask, proxyToRuntime } from "@/lib/agent/http-proxy"

/**
 * HTTP bridge: /api/agent/fs/<taskId>/<...path>  →  runtime /fs/<...path>
 *
 * Same resolver/proxy pattern as /api/agent/git (see ARCHITECTURE §4.1).
 */
async function handle(
  req: NextRequest,
  ctx: { params: { taskId: string; path: string[] } },
): Promise<NextResponse> {
  const resolved = await resolveEndpointForTask(ctx.params.taskId)
  if (!resolved.ok) return resolved.response

  const tail = ctx.params.path.join("/")
  const qs = req.nextUrl.search
  return proxyToRuntime(req, `/fs/${tail}${qs}`, resolved.endpoint, resolved.runtimeJwt)
}

export const GET = handle
export const POST = handle
