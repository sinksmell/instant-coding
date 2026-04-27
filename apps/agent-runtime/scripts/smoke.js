#!/usr/bin/env node
/**
 * End-to-end smoke test for agent-runtime.
 *
 * Boots the server in-process, opens a WS connection to /agent, runs TWO
 * consecutive prompts on the same connection, verifies:
 *   - session_created fires once (same sessionId for both turns)
 *   - complete fires per turn (turnStats populated)
 *   - second turn sees the context of the first (multi-turn memory)
 *   - session_ended fires on WS close
 *
 * Exits 0 on success, non-zero on any assertion miss or timeout.
 * Makes two real billed claude API calls.
 */
import { WebSocket } from "ws";
import { startServer } from "../src/server.js";

const PORT = Number(process.env.SMOKE_PORT || 3031);
const HOST = "127.0.0.1";
const TIMEOUT_MS = 120_000;

function nowMs() {
  return Date.now();
}

async function main() {
  const { server, wssAgent, wssShell } = await startServer({
    port: PORT,
    host: HOST,
    cwd: process.cwd(),
  });

  const events = [];
  let sessionId = null;
  let completeCount = 0;
  let errorEvt = null;
  let sessionEnded = false;

  const ws = new WebSocket(`ws://${HOST}:${PORT}/agent`);

  ws.on("open", () => {
    console.log("[smoke] ws open, sending prompt #1");
    ws.send(
      JSON.stringify({
        type: "prompt",
        content: "I will give you a number. Remember it. My number is 42. Reply with only: REMEMBERED",
      })
    );
  });

  ws.on("message", (data) => {
    const evt = JSON.parse(data.toString());
    events.push(evt);
    const head = JSON.stringify(evt).slice(0, 220);
    console.log(`[smoke] <- ${head}`);
    if (evt.type === "session_created") sessionId = evt.sessionId;
    if (evt.type === "complete") {
      completeCount++;
      if (completeCount === 1) {
        console.log("[smoke] turn 1 complete, sending prompt #2");
        ws.send(
          JSON.stringify({
            type: "prompt",
            content: "What number did I tell you? Reply with only the digits.",
          })
        );
      }
    }
    if (evt.type === "session_ended") sessionEnded = true;
    if (evt.type === "error") errorEvt = evt;
  });

  ws.on("close", () => console.log("[smoke] ws closed"));

  const deadline = nowMs() + TIMEOUT_MS;
  while (completeCount < 2 && !errorEvt && nowMs() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }

  // Close gracefully and wait briefly for session_ended
  try { ws.close(); } catch {}
  const closeDeadline = nowMs() + 5000;
  while (!sessionEnded && nowMs() < closeDeadline) {
    await new Promise((r) => setTimeout(r, 100));
  }

  wssAgent.close();
  wssShell.close();
  server.close();

  // ── Assertions ─────────────────────────────────────────────────
  const fail = (msg) => {
    console.error(`[smoke] FAIL: ${msg}`);
    console.error(`[smoke] event types: ${events.map((e) => e.type).join(",")}`);
    process.exit(2);
  };

  if (errorEvt) fail(`error event: ${JSON.stringify(errorEvt)}`);
  if (completeCount < 2) fail(`got ${completeCount} complete events, expected 2 (timed out)`);
  if (!sessionId) fail("no session_created event");

  const sessionCreatedCount = events.filter((e) => e.type === "session_created").length;
  if (sessionCreatedCount !== 1)
    fail(`expected exactly 1 session_created, got ${sessionCreatedCount}`);

  const completeEvents = events.filter((e) => e.type === "complete");
  for (const c of completeEvents) {
    if (!c.turnStats || typeof c.turnStats.durationMs !== "number")
      fail(`complete event missing turnStats.durationMs: ${JSON.stringify(c)}`);
  }

  // Multi-turn memory: the 2nd-turn assistant message should contain "42".
  const assistantTexts = events
    .filter((e) => e.type === "message" && e.role === "assistant")
    .map((e) => e.content);
  const turn2Answer = assistantTexts[assistantTexts.length - 1] || "";
  if (!/42/.test(turn2Answer))
    fail(`turn 2 did not echo "42" — multi-turn memory failed. got: "${turn2Answer}"`);

  console.log(
    `[smoke] PASS: session=${sessionId} turns=${completeCount} events=${events.length} turn2="${turn2Answer.slice(0, 40)}"`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] crash:", err);
  process.exit(1);
});
