import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { normalize } from "./sdk-normalize.js"

/**
 * Read a session's full message history from Claude Code's on-disk .jsonl,
 * normalize it through the same pipeline as live stream events, and hand
 * back a ready-to-render array of WS protocol events.
 *
 * Path layout Claude Code uses (stable across 2.x):
 *   ~/.claude/projects/<cwd-with-slashes-as-dashes>/<session-id>.jsonl
 *
 * Returned events intentionally DO NOT include `session_created` or
 * `complete` — the client is hydrating past turns, not resuming a live one.
 */

export function mountHistoryRoutes(app, { cwd }) {
  app.get("/agent/history", async (req, res) => {
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : ""
    if (!/^[\w-]{8,}$/.test(sessionId)) {
      return res.status(400).json({ error: "bad_request", message: "invalid sessionId" })
    }

    const encodedCwd = cwdToClaudeProjectDir(cwd)
    const path = join(homedir(), ".claude", "projects", encodedCwd, `${sessionId}.jsonl`)

    let raw
    try {
      raw = await readFile(path, "utf8")
    } catch (e) {
      if (e.code === "ENOENT") {
        return res.status(404).json({ error: "not_found", message: "no session file" })
      }
      return res.status(500).json({ error: "read_error", message: e.message })
    }

    const events = []
    for (const line of raw.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let parsed
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        continue
      }
      for (const out of normalize(parsed)) {
        // Drop noisy bookkeeping entries that don't mean anything to a
        // replay viewer. token_usage / complete / system we keep as-is.
        if (out.type === "system" && out.subtype === "unknown") continue
        events.push(out)
      }
    }

    res.json({
      sessionId,
      events,
      path, // for debugging; harmless — path is the user's own home
    })
  })
}

/** Claude stores projects by encoding cwd as a filesystem-safe string:
 *  `/` → `-`. Leading slash produces a leading dash, e.g.
 *  /Users/a/b → -Users-a-b.
 */
function cwdToClaudeProjectDir(cwd) {
  return cwd.replace(/\//g, "-")
}
