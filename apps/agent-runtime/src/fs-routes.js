import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { resolveInside } from "./safe-path.js"

/**
 * Filesystem operations exposed under /fs. All paths are cwd-relative and
 * sandboxed via resolveInside(). Mounted by src/server.js behind JWT auth.
 *
 *   GET  /fs/tree?path=&depth=     recursive listing (default depth 20, max 40)
 *   GET  /fs/read?path=            returns { content, size, mtime, exists }
 *   POST /fs/write { path, content }  writes file; creates parent dirs
 */

const DEFAULT_DEPTH = 20
const MAX_DEPTH = 40
const MAX_FILES_PER_DIR = 500
const MAX_FILE_READ_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_FILE_WRITE_BYTES = 2 * 1024 * 1024

// Directories we skip when walking the tree — huge, auto-generated, or private
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "out",
  ".cache",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  "target", // rust
  ".gradle",
  ".idea",
  ".vscode",
])

function err(res, status, code, message) {
  res.status(status).json({ error: code, message })
}

export function mountFsRoutes(app, { cwd }) {
  // ── Tree walk ─────────────────────────────────────────────
  app.get("/fs/tree", async (req, res) => {
    const raw = typeof req.query.path === "string" ? req.query.path : ""
    const depth = Math.min(
      Number(req.query.depth) || DEFAULT_DEPTH,
      MAX_DEPTH,
    )
    const loc = resolveInside(cwd, raw)
    if (!loc) return err(res, 400, "bad_request", "invalid path")

    try {
      const st = await stat(loc.abs)
      if (!st.isDirectory()) {
        return err(res, 400, "not_a_dir", `${raw || "."} is not a directory`)
      }
      const tree = await walk(loc.abs, loc.rel, depth)
      res.json(tree)
    } catch (e) {
      if (e.code === "ENOENT") return err(res, 404, "not_found", "path does not exist")
      err(res, 500, "read_error", e.message)
    }
  })

  // ── Read ──────────────────────────────────────────────────
  app.get("/fs/read", async (req, res) => {
    const raw = typeof req.query.path === "string" ? req.query.path : ""
    const loc = resolveInside(cwd, raw)
    if (!loc) return err(res, 400, "bad_request", "invalid path")

    try {
      const st = await stat(loc.abs)
      if (st.isDirectory()) return err(res, 400, "is_a_dir", "path is a directory")
      if (st.size > MAX_FILE_READ_BYTES) {
        return err(res, 413, "too_large", `file is ${st.size} bytes (max ${MAX_FILE_READ_BYTES})`)
      }
      const buf = await readFile(loc.abs)
      // Heuristic: treat as binary if the first 4KB contains a NUL byte.
      const binary = buf.subarray(0, 4096).includes(0)
      res.json({
        exists: true,
        content: binary ? "" : buf.toString("utf8"),
        size: st.size,
        mtime: st.mtimeMs,
        binary,
      })
    } catch (e) {
      if (e.code === "ENOENT") {
        return res.json({ exists: false, content: "", size: 0, mtime: 0, binary: false })
      }
      err(res, 500, "read_error", e.message)
    }
  })

  // ── Write ─────────────────────────────────────────────────
  app.post("/fs/write", async (req, res) => {
    const { path, content } = req.body || {}
    if (typeof path !== "string" || typeof content !== "string") {
      return err(res, 400, "bad_request", "path and content required (strings)")
    }
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_WRITE_BYTES) {
      return err(res, 413, "too_large", `content exceeds ${MAX_FILE_WRITE_BYTES} bytes`)
    }
    const loc = resolveInside(cwd, path)
    if (!loc) return err(res, 400, "bad_request", "invalid path")

    try {
      await mkdir(dirname(loc.abs), { recursive: true })
      await writeFile(loc.abs, content, "utf8")
      const st = await stat(loc.abs)
      res.json({ ok: true, size: st.size, mtime: st.mtimeMs })
    } catch (e) {
      err(res, 500, "write_error", e.message)
    }
  })
}

async function walk(abs, rel, depthLeft) {
  const self = {
    name: rel === "" ? "." : rel.split("/").pop(),
    path: rel,
    type: "dir",
  }
  if (depthLeft <= 0) {
    return { ...self, children: [], truncated: true }
  }
  let entries
  try {
    entries = await readdir(abs, { withFileTypes: true })
  } catch {
    return { ...self, children: [] }
  }
  const filtered = entries
    .filter((e) => !(e.isDirectory() && IGNORED_DIRS.has(e.name)))
    .slice(0, MAX_FILES_PER_DIR)

  const children = await Promise.all(
    filtered.map(async (e) => {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      const childAbs = `${abs}/${e.name}`
      if (e.isDirectory()) {
        return walk(childAbs, childRel, depthLeft - 1)
      }
      let size = 0
      try {
        const st = await stat(childAbs)
        size = st.size
      } catch {}
      return { name: e.name, path: childRel, type: "file", size }
    }),
  )

  // sort: dirs first, then files, alphabetical within each group
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    ...self,
    children,
    truncated: entries.length > MAX_FILES_PER_DIR,
  }
}
