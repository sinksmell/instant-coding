import { WebSocket as UpstreamWebSocket } from "ws"
import type { WebSocket as ClientWebSocket, RawData } from "ws"

/**
 * Transparently pipe a client WS (Browser ↔ BFF) to the upstream agent-runtime
 * WS (BFF ↔ Codespace). Both directions buffer-until-open and close on error.
 *
 * Messages are forwarded as-is — BFF does not parse or inspect the payload.
 * The protocol contract lives on the runtime side (ARCHITECTURE §5.3).
 */
export function proxyWebSocket(
  client: ClientWebSocket,
  upstreamUrl: string,
  upstreamHeaders: Record<string, string>,
): void {
  let upstream: UpstreamWebSocket
  try {
    upstream = new UpstreamWebSocket(upstreamUrl, {
      headers: upstreamHeaders,
      // Honor WS subprotocols later if we introduce any
    })
  } catch (err) {
    sendClientError(client, "runtime_unreachable", (err as Error).message)
    safeClose(client, 1011, "runtime_unreachable")
    return
  }

  const pendingFromClient: RawData[] = []
  let upstreamReady = false

  upstream.on("open", () => {
    upstreamReady = true
    while (pendingFromClient.length > 0) {
      const data = pendingFromClient.shift()!
      upstream.send(data)
    }
  })

  upstream.on("message", (data) => {
    if (client.readyState === client.OPEN) {
      client.send(data)
    }
  })

  upstream.on("close", (code, reason) => {
    safeClose(client, sanitizeCloseCode(code), reason.toString())
  })

  upstream.on("error", (err) => {
    sendClientError(client, "runtime_unreachable", err.message)
    safeClose(client, 1011, "runtime_unreachable")
  })

  client.on("message", (data) => {
    if (upstreamReady && upstream.readyState === upstream.OPEN) {
      upstream.send(data)
    } else {
      pendingFromClient.push(data)
    }
  })

  client.on("close", (code, reason) => {
    try {
      upstream.close(sanitizeCloseCode(code), reason.toString())
    } catch {
      /* noop */
    }
  })

  client.on("error", () => {
    try {
      upstream.close(1011)
    } catch {
      /* noop */
    }
  })
}

function sendClientError(client: ClientWebSocket, code: string, message: string) {
  if (client.readyState !== client.OPEN) return
  try {
    client.send(JSON.stringify({ type: "error", code, message }))
  } catch {
    /* noop */
  }
}

function safeClose(client: ClientWebSocket, code: number, reason: string) {
  if (client.readyState === client.CLOSED || client.readyState === client.CLOSING) return
  try {
    client.close(code, reason)
  } catch {
    /* noop */
  }
}

/**
 * WS close codes outside 1000–4999 are invalid to re-emit. Map 1005 (no status)
 * and other reserved codes to 1011 (server error) when forwarding.
 */
function sanitizeCloseCode(code: number): number {
  if (code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 && code !== 1015) {
    return code
  }
  return 1011
}
