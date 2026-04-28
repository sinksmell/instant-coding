import { ClaudeSession } from "./claude-sdk.js"
import { verifyWsUpgrade } from "./auth.js"

/**
 * Wire one WS connection to an SDK-backed Claude session.
 *
 * Lifecycle:
 *   - First `prompt` calls session.start() — SDK spawns a query; session id is
 *     captured from the first SDK message and emitted to the client once.
 *   - Each subsequent `prompt` on the same WS calls session.sendPrompt(), which
 *     runs a fresh SDK query() with options.resume=<captured session id>. Claude
 *     Code's ~/.claude/projects/<cwd-hash>/<sid>.jsonl still holds the full
 *     history so a shell tab can `claude --resume <id>` to take over.
 *   - `abort` interrupts the running SDK query (graceful .interrupt()).
 *   - `permission_decision` resolves a pending SDK canUseTool request.
 *   - WS close calls session.stop(), which auto-denies every outstanding
 *     permission request.
 */
export function handleAgentConnection(ws, req, { cwd }) {
  const auth = verifyWsUpgrade(req)
  if (!auth.ok) {
    ws.send(
      JSON.stringify({
        type: "error",
        code: "auth_failed",
        message: auth.reason || "unauthorized",
      })
    )
    ws.close(4401, "auth_failed")
    return
  }

  const apiKey = req.headers["x-anthropic-api-key"]
  const baseUrl = req.headers["x-anthropic-base-url"]
  const extraEnv = {}
  if (apiKey) extraEnv.ANTHROPIC_API_KEY = String(apiKey)
  if (baseUrl) extraEnv.ANTHROPIC_BASE_URL = String(baseUrl)

  /** @type {ClaudeSession | null} */
  let session = null

  function send(evt) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(evt))
    }
  }

  function ensureSession(firstPrompt, promptMsg) {
    session = new ClaudeSession({
      cwd,
      sessionId: promptMsg.sessionId,
      env: extraEnv,
      permissionMode: promptMsg.permissionMode,
      allowedTools: promptMsg.allowedTools,
      disallowedTools: promptMsg.disallowedTools,
      model: promptMsg.model,
      onEvent: (evt) => send(evt),
      onError: (err) => send({ type: "error", code: err.code, message: err.message }),
      onExit: (reason) => {
        send({ type: "session_ended", reason })
        session = null
        if (ws.readyState === ws.OPEN) ws.close(1000, "session_ended")
      },
    })
    // Fire and forget — errors surface via onError/onEvent.
    session.start(firstPrompt).catch(() => {})
  }

  ws.on("message", (data) => {
    let msg
    try {
      msg = JSON.parse(data.toString())
    } catch {
      send({ type: "error", code: "bad_request", message: "invalid JSON" })
      return
    }

    if (msg.type === "prompt") {
      if (!msg.content || typeof msg.content !== "string") {
        send({ type: "error", code: "bad_request", message: "prompt.content required" })
        return
      }
      if (!session) {
        ensureSession(msg.content, msg)
      } else {
        // permissionMode / allowedTools set on first prompt; ignored here (baked
        // into the SDK session). sessionId is also already bound.
        session.sendPrompt(msg.content).catch(() => {})
      }
      return
    }

    if (msg.type === "abort") {
      session?.abort()
      return
    }

    if (msg.type === "permission_decision") {
      if (!session) {
        send({ type: "error", code: "no_session", message: "no active session" })
        return
      }
      if (typeof msg.requestId !== "string") {
        send({ type: "error", code: "bad_request", message: "requestId required" })
        return
      }
      const decision = msg.allow
        ? { behavior: "allow", updatedInput: msg.updatedInput }
        : { behavior: "deny", message: msg.reason || "user denied" }
      session.resolvePermission(msg.requestId, decision)
      return
    }

    send({ type: "error", code: "bad_request", message: `unknown type: ${msg.type}` })
  })

  ws.on("close", () => {
    session?.stop()
  })

  ws.on("error", (err) => {
    send({ type: "error", code: "runtime_unreachable", message: err.message })
    session?.stop()
  })
}
