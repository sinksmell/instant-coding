import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import { WebSocketServer, type WebSocket } from "ws"
import { getToken } from "next-auth/jwt"
import { createClient } from "@/lib/supabase/server"
import { decrypt } from "@/lib/crypto"
import { ensureRunning, LifecycleError, type RuntimeEndpoint } from "./lifecycle"
import { signRuntimeJwt } from "./jwt"
import { proxyWebSocket } from "./proxy"

/**
 * Handle an HTTP upgrade for /api/agent/ws?taskId=<uuid> (agent chat) or
 * /api/agent/shell/ws?taskId=<uuid> (pty terminal, M8).
 *
 * Flow (matches ARCHITECTURE §4.1):
 *   1. Decode NextAuth session from cookies
 *   2. Load task + user + codespace metadata from Supabase
 *   3. ensureRunning() → boot the Codespace if needed, return endpoint URL
 *   4. Decrypt the user's ANTHROPIC_API_KEY (chat path only)
 *   5. Sign a short-lived runtime JWT
 *   6. Accept the WS handshake, then proxy traffic both directions
 */
export async function handleAgentUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
  opts: { upstreamPath: "/agent" | "/shell"; injectApiKey: boolean } = {
    upstreamPath: "/agent",
    injectApiKey: true,
  },
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://localhost")
    const taskId = url.searchParams.get("taskId")
    if (!taskId) {
      return rejectHandshake(socket, 400, "taskId query param required")
    }

    // ── 1. Session ────────────────────────────────────────────
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
      return rejectHandshake(socket, 500, "NEXTAUTH_SECRET not configured")
    }
    // next-auth/jwt#getToken supports { req: IncomingMessage }
    const token = await getToken({ req: req as unknown as Parameters<typeof getToken>[0]["req"], secret })
    if (!token?.githubId) {
      return rejectHandshake(socket, 401, "unauthorized")
    }

    // ── 2. Task + user + codespace lookup ─────────────────────
    const supabase = createClient()
    const { data: user } = await supabase
      .from("users")
      .select("id, anthropic_api_key_encrypted, anthropic_base_url")
      .eq("github_id", token.githubId)
      .single()
    if (!user) {
      return rejectHandshake(socket, 404, "user not found")
    }

    const { data: task } = await supabase
      .from("tasks")
      .select("id, user_id, codespace_id")
      .eq("id", taskId)
      .single()
    if (!task) {
      return rejectHandshake(socket, 404, "task not found")
    }
    if (task.user_id !== user.id) {
      return rejectHandshake(socket, 403, "task not owned")
    }

    // ── 3. Codespace lifecycle ───────────────────────────────
    const accessToken = (token.accessToken as string | undefined) ?? ""
    let endpoint: RuntimeEndpoint
    try {
      endpoint = await ensureRunning({
        codespaceId: task.codespace_id ?? null,
        userId: user.id,
        accessToken,
      })
    } catch (err) {
      if (err instanceof LifecycleError) {
        return rejectHandshake(socket, err.httpStatus, err.code, err.message)
      }
      throw err
    }

    // ── 4. Decrypt API key (chat path only — pty doesn't need it) ─────
    let apiKey: string | null = null
    if (opts.injectApiKey && user.anthropic_api_key_encrypted) {
      try {
        apiKey = decrypt(user.anthropic_api_key_encrypted)
      } catch (err) {
        console.error("[agent-upgrade] decrypt failed:", err)
      }
    }

    // ── 5. Sign runtime JWT ───────────────────────────────────
    const runtimeJwt = signRuntimeJwt(user.id)

    // ── 6. Accept and proxy ───────────────────────────────────
    const upstreamUrl = endpoint.httpUrl.replace(/^http/, "ws") + opts.upstreamPath
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${runtimeJwt}`,
        ...endpoint.headers,
      }
      if (apiKey) headers["X-Anthropic-Api-Key"] = apiKey
      if (opts.injectApiKey && user.anthropic_base_url) {
        headers["X-Anthropic-Base-Url"] = user.anthropic_base_url
      }

      proxyWebSocket(ws, upstreamUrl, headers)
    })
  } catch (err) {
    console.error("[agent-upgrade] fatal:", err)
    rejectHandshake(socket, 500, "internal error", (err as Error).message)
  }
}

function rejectHandshake(
  socket: Duplex,
  status: number,
  code: string,
  message?: string,
): void {
  const body = JSON.stringify({ error: code, message: message ?? code })
  socket.write(
    `HTTP/1.1 ${status} ${httpStatusText(status)}\r\n` +
      `Content-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      `Connection: close\r\n\r\n` +
      body,
  )
  socket.destroy()
}

function httpStatusText(code: number): string {
  return (
    ({
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error",
      503: "Service Unavailable",
    } as Record<number, string>)[code] ?? "Error"
  )
}
