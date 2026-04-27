#!/usr/bin/env node
/**
 * Smoke test for /shell WS.
 *
 * Boots the runtime, opens a WS to /shell, types "echo IC_SHELL_OK\n" + "exit\n",
 * and asserts we see the literal marker in the output stream before the pty exits.
 * Also verifies {type:"resize"} is accepted without error.
 */
import { WebSocket } from "ws"
import { startServer } from "../src/server.js"

const PORT = Number(process.env.SMOKE_SHELL_PORT || 3041)
const HOST = "127.0.0.1"
const TIMEOUT_MS = 30_000
const MARKER = "IC_SHELL_OK"

async function main() {
  const { server, wssAgent, wssShell } = await startServer({
    port: PORT,
    host: HOST,
    cwd: process.cwd(),
  })

  const events = []
  let sawMarker = false
  let gotExit = false
  let errorEvt = null

  const ws = new WebSocket(`ws://${HOST}:${PORT}/shell`)

  ws.on("open", () => {
    console.log("[smoke-shell] open")
    ws.send(JSON.stringify({ type: "resize", cols: 100, rows: 30 }))
    // Give the shell a beat to emit its prompt before we type
    setTimeout(() => {
      ws.send(JSON.stringify({ type: "input", data: `echo ${MARKER}\n` }))
      setTimeout(() => ws.send(JSON.stringify({ type: "input", data: "exit\n" })), 500)
    }, 300)
  })

  ws.on("message", (raw) => {
    const evt = JSON.parse(raw.toString())
    events.push(evt.type)
    if (evt.type === "output" && typeof evt.data === "string" && evt.data.includes(MARKER)) {
      sawMarker = true
    }
    if (evt.type === "exit") gotExit = true
    if (evt.type === "error") errorEvt = evt
  })

  ws.on("close", () => console.log("[smoke-shell] closed"))

  const deadline = Date.now() + TIMEOUT_MS
  while (!gotExit && !errorEvt && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
  }

  try { ws.close() } catch {}
  wssAgent.close()
  wssShell.close()
  server.close()

  const fail = (msg) => {
    console.error(`[smoke-shell] FAIL: ${msg}`)
    console.error(`[smoke-shell] event types: ${events.join(",")}`)
    process.exit(2)
  }

  if (errorEvt) fail(`error event: ${JSON.stringify(errorEvt)}`)
  if (!sawMarker) fail(`did not see marker "${MARKER}" in output`)
  if (!gotExit) fail("pty did not exit within timeout")

  console.log(`[smoke-shell] PASS: events=${events.length} marker=yes exit=yes`)
  process.exit(0)
}

main().catch((err) => {
  console.error("[smoke-shell] crash:", err)
  process.exit(1)
})
