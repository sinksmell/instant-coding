import os from "node:os"
import pty from "node-pty"
import { verifyWsUpgrade } from "./auth.js"

/**
 * One PTY-backed shell per WS connection. Mounted at /shell on the runtime.
 *
 * Protocol (JSON only, one frame per message):
 *   client → server
 *     { type: "input",  data: string }     keystrokes (raw, includes escape seqs)
 *     { type: "resize", cols: n, rows: n } SIGWINCH
 *   server → client
 *     { type: "output", data: string }     pty stdout/stderr
 *     { type: "exit",   code: n|null, signal: string|null }
 *     { type: "error",  code: string, message: string }
 *
 * The shell is spawned in opts.cwd with the user's real env. No command is
 * pre-executed — the client can send "claude --resume <id>\n" as its first
 * input to take over a chat session (ARCHITECTURE §2.2 "human/machine shared").
 */

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 30
const MAX_BUFFERED = 1_000_000 // ~1MB per connection

function defaultShell() {
  if (os.platform() === "win32") return "powershell.exe"
  return process.env.SHELL || "/bin/bash"
}

export function handleShellConnection(ws, req, { cwd }) {
  const auth = verifyWsUpgrade(req)
  if (!auth.ok) {
    send(ws, { type: "error", code: "auth_failed", message: auth.reason || "unauthorized" })
    ws.close(4401, "auth_failed")
    return
  }

  const shell = defaultShell()
  const shellArgs = os.platform() === "win32" ? [] : ["--login"]

  let proc
  try {
    proc = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols: DEFAULT_COLS,
      rows: DEFAULT_ROWS,
      cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "3",
      },
    })
  } catch (err) {
    send(ws, {
      type: "error",
      code: "pty_spawn_failed",
      message: err instanceof Error ? err.message : String(err),
    })
    ws.close(1011, "pty_spawn_failed")
    return
  }

  let buffered = 0
  proc.onData((chunk) => {
    if (ws.readyState !== ws.OPEN) return
    // Back-pressure: if the client can't keep up, drop output instead of OOMing.
    if (buffered > MAX_BUFFERED) {
      return
    }
    buffered += chunk.length
    ws.send(JSON.stringify({ type: "output", data: chunk }), (err) => {
      if (!err) buffered = Math.max(0, buffered - chunk.length)
    })
  })

  proc.onExit(({ exitCode, signal }) => {
    send(ws, { type: "exit", code: exitCode ?? null, signal: signal ?? null })
    try {
      ws.close(1000, "shell_exited")
    } catch {}
  })

  ws.on("message", (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      send(ws, { type: "error", code: "bad_request", message: "invalid JSON" })
      return
    }
    if (msg.type === "input" && typeof msg.data === "string") {
      try {
        proc.write(msg.data)
      } catch (err) {
        send(ws, {
          type: "error",
          code: "pty_write_failed",
          message: err instanceof Error ? err.message : String(err),
        })
      }
      return
    }
    if (msg.type === "resize") {
      const cols = Number(msg.cols)
      const rows = Number(msg.rows)
      if (Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0) {
        try {
          proc.resize(Math.min(cols, 500), Math.min(rows, 200))
        } catch {}
      }
      return
    }
    send(ws, { type: "error", code: "bad_request", message: `unknown type: ${msg.type}` })
  })

  ws.on("close", () => {
    try {
      proc.kill()
    } catch {}
  })

  ws.on("error", () => {
    try {
      proc.kill()
    } catch {}
  })
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(payload))
    } catch {}
  }
}
