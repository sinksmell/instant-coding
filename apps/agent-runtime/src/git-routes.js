import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { resolve as pathResolve, relative as pathRelative } from "node:path"

/**
 * Minimal git operations exposed over REST for the Diff / Commit / Push UX.
 * Mounted under /git by src/server.js.
 *
 * All endpoints run `git` in opts.cwd. No user-supplied shell strings — args
 * are passed as arrays and `path` inputs are validated to prevent escaping.
 *
 * Protocol (kept simple for M7; will likely harden with stricter schemas later):
 *   GET  /git/status                → { branch, ahead, behind, files: [{path, index, worktree}] }
 *   GET  /git/diff?path=&staged=    → { diff: string, stat: string }
 *   GET  /git/file?path=&ref=       → { content: string, exists: boolean }
 *   POST /git/commit  { message, paths? }      → { sha, branch }
 *   POST /git/push    { branch?, setUpstream? } → { branch, remote, sha }
 */

function runGit(args, cwd, { input } = {}) {
  return new Promise((resolve) => {
    const proc = spawn("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    proc.stdout.setEncoding("utf8")
    proc.stderr.setEncoding("utf8")
    proc.stdout.on("data", (c) => (stdout += c))
    proc.stderr.on("data", (c) => (stderr += c))
    proc.on("error", (err) => resolve({ ok: false, stdout, stderr: err.message, code: -1 }))
    proc.on("close", (code) => resolve({ ok: code === 0, stdout, stderr, code }))
    if (input !== undefined) {
      proc.stdin.end(input)
    } else {
      proc.stdin.end()
    }
  })
}

function isSafePath(p) {
  if (typeof p !== "string" || p.length === 0) return false
  if (p.startsWith("/") || p.startsWith("\\")) return false
  // Disallow traversal; git handles ./ fine but we reject ..
  if (p.split(/[/\\]/).some((seg) => seg === "..")) return false
  return true
}

function err(res, status, code, message) {
  res.status(status).json({ error: code, message })
}

export function mountGitRoutes(app, { cwd }) {
  // ── Status ────────────────────────────────────────────────
  app.get("/git/status", async (_req, res) => {
    const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
    if (!branch.ok) return err(res, 500, "git_error", branch.stderr)

    // porcelain v2 gives us machine-parseable entries + branch info
    const st = await runGit(["status", "--porcelain=v2", "--branch"], cwd)
    if (!st.ok) return err(res, 500, "git_error", st.stderr)

    const files = []
    let ahead = 0
    let behind = 0

    for (const line of st.stdout.split("\n")) {
      if (!line) continue
      if (line.startsWith("# branch.ab ")) {
        const m = line.match(/# branch\.ab \+(\d+) -(\d+)/)
        if (m) {
          ahead = Number(m[1])
          behind = Number(m[2])
        }
      } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
        // "1 XY sub mH mI mW hH hI path" — renamed has extra score field
        const parts = line.split(" ")
        const xy = parts[1]
        const path = line.startsWith("2 ")
          ? parts.slice(9).join(" ") // renamed: path\torig
          : parts.slice(8).join(" ")
        files.push({ path, index: xy[0], worktree: xy[1] })
      } else if (line.startsWith("? ")) {
        files.push({ path: line.slice(2), index: "?", worktree: "?" })
      }
    }

    res.json({ branch: branch.stdout.trim(), ahead, behind, files })
  })

  // ── Diff ──────────────────────────────────────────────────
  app.get("/git/diff", async (req, res) => {
    const path = typeof req.query.path === "string" ? req.query.path : ""
    const staged = req.query.staged === "true"

    if (path && !isSafePath(path)) {
      return err(res, 400, "bad_request", "invalid path")
    }

    const args = ["diff", "--no-color"]
    if (staged) args.push("--cached")
    if (path) args.push("--", path)

    const [diffRes, statRes] = await Promise.all([
      runGit(args, cwd),
      runGit([...args.slice(0, staged ? 2 : 1), "--stat", ...(path ? ["--", path] : [])], cwd),
    ])

    if (!diffRes.ok) return err(res, 500, "git_error", diffRes.stderr)
    res.json({ diff: diffRes.stdout, stat: statRes.stdout })
  })

  // ── Working-tree file content (from disk, pre-staging) ────
  app.get("/git/worktree", async (req, res) => {
    const path = typeof req.query.path === "string" ? req.query.path : ""
    if (!isSafePath(path)) return err(res, 400, "bad_request", "invalid path")
    // Extra guard: ensure the resolved path stays inside cwd
    const abs = pathResolve(cwd, path)
    const rel = pathRelative(cwd, abs)
    if (rel.startsWith("..") || pathResolve(abs) !== abs) {
      return err(res, 400, "bad_request", "path escapes cwd")
    }
    try {
      const content = await readFile(abs, "utf8")
      res.json({ content, exists: true })
    } catch (e) {
      if (e.code === "ENOENT") {
        res.json({ content: "", exists: false })
      } else {
        err(res, 500, "read_error", e.message)
      }
    }
  })

  // ── File content (at HEAD or ref) ─────────────────────────
  app.get("/git/file", async (req, res) => {
    const path = typeof req.query.path === "string" ? req.query.path : ""
    const ref = typeof req.query.ref === "string" && req.query.ref ? req.query.ref : "HEAD"

    if (!isSafePath(path)) return err(res, 400, "bad_request", "invalid path")
    if (!/^[\w./\-]+$/.test(ref)) return err(res, 400, "bad_request", "invalid ref")

    const r = await runGit(["show", `${ref}:${path}`], cwd)
    if (r.ok) {
      res.json({ content: r.stdout, exists: true })
    } else if (/does not exist|exists on disk|bad object/i.test(r.stderr)) {
      res.json({ content: "", exists: false })
    } else {
      err(res, 500, "git_error", r.stderr)
    }
  })

  // ── Commit ────────────────────────────────────────────────
  app.post("/git/commit", async (req, res) => {
    const { message, paths } = req.body || {}
    if (!message || typeof message !== "string") {
      return err(res, 400, "bad_request", "message required")
    }
    if (paths !== undefined) {
      if (!Array.isArray(paths) || !paths.every(isSafePath)) {
        return err(res, 400, "bad_request", "invalid paths")
      }
    }

    // Stage: specific paths if given, otherwise everything tracked+untracked
    const addArgs = paths && paths.length > 0 ? ["add", "--", ...paths] : ["add", "-A"]
    const addRes = await runGit(addArgs, cwd)
    if (!addRes.ok) return err(res, 500, "git_error", addRes.stderr)

    // Commit via stdin so the message can contain newlines/quotes safely
    const commitRes = await runGit(
      ["commit", "-F", "-"],
      cwd,
      { input: message },
    )
    if (!commitRes.ok) {
      // "nothing to commit" is exit 1 but not really an error from the user's POV
      if (/nothing to commit/.test(commitRes.stdout + commitRes.stderr)) {
        return err(res, 409, "nothing_to_commit", "no changes staged")
      }
      return err(res, 500, "git_error", commitRes.stderr || commitRes.stdout)
    }

    const [shaRes, branchRes] = await Promise.all([
      runGit(["rev-parse", "HEAD"], cwd),
      runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    ])
    res.json({ sha: shaRes.stdout.trim(), branch: branchRes.stdout.trim() })
  })

  // ── Push ──────────────────────────────────────────────────
  app.post("/git/push", async (req, res) => {
    const { branch, setUpstream } = req.body || {}
    let targetBranch = branch
    if (!targetBranch) {
      const cur = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
      if (!cur.ok) return err(res, 500, "git_error", cur.stderr)
      targetBranch = cur.stdout.trim()
    }
    if (!/^[\w./\-]+$/.test(targetBranch)) {
      return err(res, 400, "bad_request", "invalid branch")
    }

    const args = ["push", "origin"]
    if (setUpstream !== false) args.push("-u")
    args.push(`HEAD:${targetBranch}`)

    const r = await runGit(args, cwd)
    if (!r.ok) {
      // Surface auth / protected-branch failures clearly
      const msg = r.stderr || r.stdout
      const code = /authentication|permission|denied/i.test(msg)
        ? "auth_failed"
        : "push_failed"
      return err(res, 500, code, msg)
    }

    const shaRes = await runGit(["rev-parse", "HEAD"], cwd)
    res.json({
      branch: targetBranch,
      remote: "origin",
      sha: shaRes.stdout.trim(),
      output: r.stdout + r.stderr,
    })
  })
}
