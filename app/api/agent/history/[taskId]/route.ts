import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { resolveEndpointForTask, proxyToRuntime } from "@/lib/agent/http-proxy"

/**
 * GET /api/agent/history/<taskId>?sessionId=<sid>
 *
 * Proxies to the runtime's /agent/history, which reads
 * ~/.claude/projects/<encoded-cwd>/<sid>.jsonl and returns normalized
 * WS-protocol events so the chat UI can hydrate past turns on page load.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: { taskId: string } },
): Promise<NextResponse> {
  const resolved = await resolveEndpointForTask(ctx.params.taskId)
  if (!resolved.ok) return resolved.response
  const qs = req.nextUrl.search
  return proxyToRuntime(req, `/agent/history${qs}`, resolved.endpoint, resolved.runtimeJwt)
}
