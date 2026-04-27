import { resolve as pathResolve, relative as pathRelative } from "node:path"

/**
 * Path sandbox helpers shared by /git and /fs routes. Every user-supplied
 * `path` must be a cwd-relative POSIX-ish string that doesn't escape.
 */

export function isSafeRelative(p) {
  if (typeof p !== "string") return false
  if (p.startsWith("/") || p.startsWith("\\")) return false
  if (p.split(/[/\\]/).some((seg) => seg === "..")) return false
  return true
}

/**
 * Resolve p against cwd, reject if the result escapes cwd.
 * Returns { abs, rel } or null if the path is not inside cwd.
 * Empty string / "." resolve to cwd itself.
 */
export function resolveInside(cwd, p) {
  if (p !== "" && p !== "." && !isSafeRelative(p)) return null
  const abs = pathResolve(cwd, p || ".")
  const rel = pathRelative(cwd, abs)
  if (rel.startsWith("..")) return null
  return { abs, rel }
}
