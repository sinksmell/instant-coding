#!/usr/bin/env node
/**
 * Smoke test for the /fs/* REST endpoints.
 *
 * Creates a throwaway directory with files + nested dirs, boots agent-runtime
 * against it, exercises tree / read / write, asserts sandbox + binary detection
 * + write round-trip.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startServer } from "../src/server.js"

const PORT = Number(process.env.SMOKE_FS_PORT || 3042)
const HOST = "127.0.0.1"

async function http(method, path, body) {
  const res = await fetch(`http://${HOST}:${PORT}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  return { status: res.status, body: json }
}

async function main() {
  const root = mkdtempSync(join(tmpdir(), "ic-fs-smoke-"))
  mkdirSync(join(root, "src"), { recursive: true })
  mkdirSync(join(root, "node_modules", "ignored"), { recursive: true })
  writeFileSync(join(root, "README.md"), "# hello\nworld\n")
  writeFileSync(join(root, "src/index.ts"), "export const x = 1\n")
  // binary-ish file: 16 zero bytes + text
  writeFileSync(join(root, "bin.dat"), Buffer.concat([Buffer.alloc(16, 0), Buffer.from("tail")]))

  const { server } = await startServer({ port: PORT, host: HOST, cwd: root })

  let ok = true
  const check = (cond, label) => {
    if (!cond) { ok = false; console.error(`  ✗ ${label}`) }
    else console.log(`  ✓ ${label}`)
  }

  try {
    // ── Tree ─────────────────────────────────
    const tree = await http("GET", "/fs/tree")
    check(tree.status === 200, `tree 200 (got ${tree.status})`)
    const names = (tree.body.children || []).map((c) => c.name)
    check(names.includes("README.md"), "tree includes README.md")
    check(names.includes("src"), "tree includes src dir")
    check(!names.includes("node_modules"), "tree skips node_modules")
    const srcChild = tree.body.children.find((c) => c.name === "src")
    check(Array.isArray(srcChild?.children), "src has children listed (recursive)")
    check(
      srcChild?.children.some((f) => f.name === "index.ts" && f.type === "file" && f.size > 0),
      "src/index.ts listed with size",
    )

    // Sort order: dirs before files
    check(tree.body.children[0].type === "dir", "dirs sort before files")

    // ── Read (text) ──────────────────────────
    const readMd = await http("GET", "/fs/read?path=README.md")
    check(readMd.status === 200 && readMd.body.exists === true, "read exists=true")
    check(readMd.body.content === "# hello\nworld\n", "read returns exact content")
    check(readMd.body.binary === false, "text flagged non-binary")

    // ── Read (missing) ───────────────────────
    const missing = await http("GET", "/fs/read?path=nope.md")
    check(missing.body.exists === false, "missing file exists=false")

    // ── Read (binary) ────────────────────────
    const bin = await http("GET", "/fs/read?path=bin.dat")
    check(bin.body.exists === true && bin.body.binary === true, "NUL byte flags binary")
    check(bin.body.content === "", "binary returns empty content")

    // ── Sandbox ──────────────────────────────
    const bad = await http("GET", "/fs/read?path=../etc/passwd")
    check(bad.status === 400, `traversal rejected (got ${bad.status})`)
    const badAbs = await http("GET", "/fs/read?path=/etc/passwd")
    check(badAbs.status === 400, `absolute path rejected (got ${badAbs.status})`)

    // ── Write ────────────────────────────────
    const wr = await http("POST", "/fs/write", {
      path: "src/new.ts",
      content: "export const greeting = 'hello'\n",
    })
    check(wr.status === 200 && wr.body.ok === true, "write 200 ok=true")
    const onDisk = readFileSync(join(root, "src/new.ts"), "utf8")
    check(onDisk === "export const greeting = 'hello'\n", "written content matches disk")

    // Overwrite
    const wr2 = await http("POST", "/fs/write", { path: "src/new.ts", content: "v2\n" })
    check(wr2.status === 200, "overwrite 200")
    const onDisk2 = readFileSync(join(root, "src/new.ts"), "utf8")
    check(onDisk2 === "v2\n", "overwrite took effect")

    // Write creates nested dirs
    const wr3 = await http("POST", "/fs/write", {
      path: "deeply/nested/new.txt",
      content: "deep\n",
    })
    check(wr3.status === 200, "write to new nested dir")
    check(readFileSync(join(root, "deeply/nested/new.txt"), "utf8") === "deep\n", "nested file on disk")

    // Write sandbox
    const wrBad = await http("POST", "/fs/write", { path: "../evil.txt", content: "x" })
    check(wrBad.status === 400, "write traversal rejected")

    // Write size limit (oversized)
    const huge = "x".repeat(3 * 1024 * 1024)
    const wrHuge = await http("POST", "/fs/write", { path: "big.txt", content: huge })
    check(wrHuge.status === 413, `oversize 413 (got ${wrHuge.status})`)
  } finally {
    server.close()
    rmSync(root, { recursive: true, force: true })
  }

  if (!ok) { console.error("[smoke-fs] FAIL"); process.exit(2) }
  console.log("[smoke-fs] PASS")
  process.exit(0)
}

main().catch((e) => { console.error("[smoke-fs] crash:", e); process.exit(1) })
