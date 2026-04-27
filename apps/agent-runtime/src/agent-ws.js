import { ClaudeSession } from "./claude-proc.js";
import { verifyWsUpgrade } from "./auth.js";

/**
 * Wire one WS connection to a dedicated claude child process.
 *
 * Lifecycle:
 *   - First `prompt` spawns the child. `permissionMode` / `allowedTools` /
 *     `disallowedTools` are fixed at spawn time and cannot be changed mid-session.
 *   - Subsequent `prompt`s pipe into stdin of the same process (multi-turn).
 *   - `abort` sends SIGINT (5s grace → SIGTERM).
 *   - WS close tears the session down.
 *
 * Note: `claude -p` in headless mode does NOT emit interactive `permission_request`
 * events. Tool gating is configured up-front via the fields above; blocked calls
 * surface as `tool_result` with `is_error: true` and a final `permission_denied`
 * summary event.
 */
export function handleAgentConnection(ws, req, { cwd }) {
  const auth = verifyWsUpgrade(req);
  if (!auth.ok) {
    ws.send(
      JSON.stringify({
        type: "error",
        code: "auth_failed",
        message: auth.reason || "unauthorized",
      })
    );
    ws.close(4401, "auth_failed");
    return;
  }

  const apiKey = req.headers["x-anthropic-api-key"];
  const baseUrl = req.headers["x-anthropic-base-url"];
  const extraEnv = {};
  if (apiKey) extraEnv.ANTHROPIC_API_KEY = String(apiKey);
  if (baseUrl) extraEnv.ANTHROPIC_BASE_URL = String(baseUrl);

  /** @type {ClaudeSession | null} */
  let session = null;
  let turnCompletedAtLeastOnce = false;
  let emittedSessionId = null;

  function send(evt) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(evt));
    }
  }

  function spawnSession(firstPrompt, promptMsg) {
    session = new ClaudeSession({
      cwd,
      sessionId: promptMsg.sessionId,
      env: extraEnv,
      permissionMode: promptMsg.permissionMode,
      allowedTools: promptMsg.allowedTools,
      disallowedTools: promptMsg.disallowedTools,
      onEvent: (evt) => {
        // claude emits `system/init` on every turn; collapse to a single
        // `session_created` per WS connection (sessionId is stable across turns).
        if (evt.type === "session_created") {
          if (emittedSessionId === evt.sessionId) return;
          emittedSessionId = evt.sessionId;
        }
        if (evt.type === "complete") turnCompletedAtLeastOnce = true;
        send(evt);
      },
      onError: (err) => {
        send({ type: "error", code: err.code, message: err.message });
      },
      onExit: (code, signal) => {
        // Distinguish clean session end from a mid-turn crash.
        if (code === 0 || (code === null && signal === "SIGTERM" && turnCompletedAtLeastOnce)) {
          send({ type: "session_ended", reason: signal === "SIGTERM" ? "aborted" : "normal" });
        } else if (signal === "SIGINT") {
          send({ type: "session_ended", reason: "user_abort" });
        } else {
          send({
            type: "error",
            code: "claude_process_crashed",
            message: `claude exited with code=${code} signal=${signal}`,
          });
        }
        session = null;
        if (ws.readyState === ws.OPEN) ws.close(1000, "session_ended");
      },
    });
    session.start(firstPrompt);
  }

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send({ type: "error", code: "bad_request", message: "invalid JSON" });
      return;
    }

    if (msg.type === "prompt") {
      if (!msg.content || typeof msg.content !== "string") {
        send({ type: "error", code: "bad_request", message: "prompt.content required" });
        return;
      }
      if (!session) {
        spawnSession(msg.content, msg);
      } else {
        // permissionMode / allowedTools ignored after spawn; respawn required to change.
        session.sendPrompt(msg.content);
      }
      return;
    }

    if (msg.type === "abort") {
      if (session) session.abort();
      return;
    }

    // `permission_decision` is intentionally unsupported: headless claude has no
    // interactive permission round-trip. Configure tool gating via the `prompt`
    // fields `permissionMode` / `allowedTools` / `disallowedTools` at session start.
    if (msg.type === "permission_decision") {
      send({
        type: "error",
        code: "not_supported",
        message:
          "permission_decision is not supported in headless mode; pass permissionMode / allowedTools / disallowedTools on the first prompt instead",
      });
      return;
    }

    send({ type: "error", code: "bad_request", message: `unknown type: ${msg.type}` });
  });

  ws.on("close", () => {
    if (session) session.stop();
  });

  ws.on("error", (err) => {
    send({ type: "error", code: "runtime_unreachable", message: err.message });
    if (session) session.stop();
  });
}
