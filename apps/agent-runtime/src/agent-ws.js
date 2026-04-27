import { ClaudeSession } from "./claude-proc.js";
import { verifyWsUpgrade } from "./auth.js";

/**
 * Mount /agent WebSocket handler on a `ws` Server.
 * Wires Browser/BFF WS messages <-> a single claude CLI child process per connection.
 *
 * WS protocol: see ARCHITECTURE §5.3.
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

  function send(evt) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(evt));
    }
  }

  function ensureSession(firstPrompt, resumeId) {
    if (session) return session;
    session = new ClaudeSession({
      cwd,
      sessionId: resumeId,
      env: extraEnv,
      onEvent: (evt) => {
        send(evt);
      },
      onError: (err) => {
        send({ type: "error", code: "runtime_unreachable", message: err.message });
      },
      onExit: (code) => {
        send({ type: "complete", exitCode: code ?? 0 });
        session = null;
      },
    });
    session.start(firstPrompt);
    return session;
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
        ensureSession(msg.content, msg.sessionId);
      } else {
        session.sendPrompt(msg.content);
      }
      return;
    }

    if (msg.type === "abort") {
      if (session) session.abort();
      return;
    }

    if (msg.type === "permission_decision") {
      // Claude's headless mode does not surface interactive permission prompts; for
      // now we acknowledge and ignore. Once --permission-mode=dontAsk + hook-based
      // permission bridging is wired, this handler will forward the decision back
      // into the child via a permission response stream-json message.
      send({ type: "system", subtype: "permission_ack", raw: msg });
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
