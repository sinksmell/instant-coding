#!/usr/bin/env node
/**
 * Smoke test for the /git/* REST endpoints.
 *
 * Sets up a throwaway git repo in os.tmpdir(), introduces a mix of
 * (untracked, modified, staged) changes, boots agent-runtime against it,
 * exercises each endpoint, asserts the minimal contract.
 *
 * Does NOT run `git push` (needs a real remote). commit is tested against
 * the temp repo where pushing would fail anyway.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startServer } from "../src/server.js"

const PORT = Number(process.env.SMOKE_GIT_PORT || 3039)
const HOST = "127.0.0.1"

function sh(args, cwd) {
  const r = spawnSync(args[0], args.slice(1), { cwd, encoding: "utf8" })
  if (r.status !== 0) {
    throw new Error(`${args.join(" ")} failed: ${r.stderr || r.stdout}`)
  }
  return r.stdout
}

async function http(method, path, body) {
  const res = await fetch(`http://${HOST}:${PORT}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, body: json }
}

async function main() {
  // ── Setup throwaway repo ────────────────────────────────
  const repo = mkdtempSync(join(tmpdir(), "ic-git-smoke-"))
  console.log(`[smoke-git] repo=${repo}`)

  sh(["git", "init", "-b", "main"], repo)
  sh(["git", "config", "user.email", "smoke@example.com"], repo)
  sh(["git", "config", "user.name", "Smoke"], repo)
  writeFileSync(join(repo, "hello.txt"), "hello world\nline two\n")
  writeFileSync(join(repo, "keep.txt"), "untouched\n")
  sh(["git", "add", "."], repo)
  sh(["git", "commit", "-m", "initial"], repo)

  // Introduce (modified), (staged), and (untracked) changes
  writeFileSync(join(repo, "hello.txt"), "hello WORLD\nline two\nline three\n") // modified (worktree)
  writeFileSync(join(repo, "new.txt"), "brand new\n") // untracked
  writeFileSync(join(repo, "staged.txt"), "staged content\n")
  sh(["git", "add", "staged.txt"], repo) // staged

  // ── Boot runtime ────────────────────────────────────────
  const { server } = await startServer({ port: PORT, host: HOST, cwd: repo })

  let ok = true
  const check = (cond, label) => {
    if (!cond) {
      ok = false
      console.error(`  ✗ ${label}`)
    } else {
      console.log(`  ✓ ${label}`)
    }
  }

  try {
    // /git/status
    const st = await http("GET", "/git/status")
    check(st.status === 200, `status 200 (got ${st.status})`)
    check(st.body.branch === "main", `branch=main (got ${st.body.branch})`)
    const paths = (st.body.files || []).map((f) => f.path)
    check(paths.includes("hello.txt"), "status lists modified hello.txt")
    check(paths.includes("new.txt"), "status lists untracked new.txt")
    check(paths.includes("staged.txt"), "status lists staged staged.txt")

    // /git/diff (worktree)
    const diff = await http("GET", "/git/diff")
    check(diff.status === 200, "diff 200")
    check(
      diff.body.diff.includes("-hello world") && diff.body.diff.includes("+hello WORLD"),
      "unstaged diff contains hunk for hello.txt",
    )

    // /git/diff?staged=true
    const diffStaged = await http("GET", "/git/diff?staged=true")
    check(diffStaged.body.diff.includes("staged.txt"), "staged diff mentions staged.txt")

    // /git/file?ref=HEAD
    const file = await http("GET", "/git/file?path=hello.txt")
    check(file.body.exists === true, "file exists at HEAD")
    check(file.body.content.includes("hello world"), "file content is pre-change version")

    // /git/file?path=new.txt — untracked, not in HEAD
    const newFile = await http("GET", "/git/file?path=new.txt")
    check(newFile.body.exists === false, "untracked file reports exists=false at HEAD")

    // /git/worktree — reads from disk (working-tree content)
    const wt = await http("GET", "/git/worktree?path=hello.txt")
    check(wt.body.exists === true, "worktree hello.txt exists")
    check(wt.body.content.includes("hello WORLD"), "worktree content is post-change version")
    const wtNew = await http("GET", "/git/worktree?path=new.txt")
    check(wtNew.body.exists === true && wtNew.body.content.includes("brand new"), "worktree reads untracked file")

    // Path traversal guard — both endpoints
    const bad = await http("GET", "/git/file?path=../etc/passwd")
    check(bad.status === 400, "path traversal rejected on /file")
    const badWt = await http("GET", "/git/worktree?path=../etc/passwd")
    check(badWt.status === 400, "path traversal rejected on /worktree")

    // /git/commit without message → 400
    const noMsg = await http("POST", "/git/commit", {})
    check(noMsg.status === 400, "commit without message 400")

    // /git/commit stages all + commits
    const commit = await http("POST", "/git/commit", { message: "smoke commit" })
    check(commit.status === 200, `commit 200 (got ${commit.status}: ${JSON.stringify(commit.body).slice(0,200)})`)
    check(typeof commit.body.sha === "string" && commit.body.sha.length >= 7, "commit returned sha")

    // After commit, status should be clean
    const afterSt = await http("GET", "/git/status")
    check((afterSt.body.files || []).length === 0, "status clean after commit")

    // commit with nothing staged → 409
    const empty = await http("POST", "/git/commit", { message: "noop" })
    check(empty.status === 409, `second commit with no changes returns 409 (got ${empty.status})`)
  } finally {
    server.close()
    rmSync(repo, { recursive: true, force: true })
  }

  if (!ok) {
    console.error("[smoke-git] FAIL")
    process.exit(2)
  }
  console.log("[smoke-git] PASS")
  process.exit(0)
}

main().catch((err) => {
  console.error("[smoke-git] crash:", err)
  process.exit(1)
})
