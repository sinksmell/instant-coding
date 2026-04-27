#!/usr/bin/env node
/**
 * End-to-end smoke test for agent-runtime.
 *
 * Boots the server in-process, opens a WS connection to /agent, sends a minimal
 * prompt, prints every event, and asserts we see session_created + complete.
 *
 * Exits 0 on success, non-zero on any assertion miss or timeout.
 */
import { WebSocket } from "ws";
import { startServer } from "../src/server.js";

const PORT = Number(process.env.SMOKE_PORT || 3031);
const HOST = "127.0.0.1";
const TIMEOUT_MS = 60_000;

async function main() {
  const { server, wssAgent, wssShell } = await startServer({
    port: PORT,
    host: HOST,
    cwd: process.cwd(),
  });

  const seen = new Set();
  let sessionId = null;
  let completed = false;
  let errorEvt = null;

  const ws = new WebSocket(`ws://${HOST}:${PORT}/agent`);
  ws.on("open", () => {
    console.log("[smoke] ws open, sending prompt");
    ws.send(
      JSON.stringify({
        type: "prompt",
        content: "reply with literal word OK and nothing else",
      })
    );
  });

  ws.on("message", (data) => {
    const evt = JSON.parse(data.toString());
    console.log("[smoke] <-", JSON.stringify(evt).slice(0, 240));
    seen.add(evt.type);
    if (evt.type === "session_created") sessionId = evt.sessionId;
    if (evt.type === "complete") completed = true;
    if (evt.type === "error") errorEvt = evt;
  });

  ws.on("close", () => {
    console.log("[smoke] ws closed");
  });

  const deadline = Date.now() + TIMEOUT_MS;
  while (!completed && !errorEvt && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }

  try { ws.close(); } catch {}
  wssAgent.close();
  wssShell.close();
  server.close();

  if (errorEvt) {
    console.error("[smoke] FAIL: got error event:", errorEvt);
    process.exit(2);
  }
  if (!completed) {
    console.error(`[smoke] FAIL: timed out after ${TIMEOUT_MS}ms. seen=${[...seen].join(",")}`);
    process.exit(3);
  }
  if (!sessionId) {
    console.error("[smoke] FAIL: no session_created event");
    process.exit(4);
  }

  console.log(`[smoke] PASS: session=${sessionId} events=${[...seen].join(",")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] crash:", err);
  process.exit(1);
});
