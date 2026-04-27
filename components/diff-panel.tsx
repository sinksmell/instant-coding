"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
  RefreshCw,
  Loader2,
  GitCommit,
  Upload,
  GitPullRequest,
  FilePlus2,
  FileMinus2,
  FilePen,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const DiffEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      加载 Monaco…
    </div>
  ),
})

// ─── Types ──────────────────────────────────────────────────────

interface GitFile {
  path: string
  index: string
  worktree: string
}

interface GitStatus {
  branch: string
  ahead: number
  behind: number
  files: GitFile[]
}

type Action =
  | { kind: "idle" }
  | { kind: "running"; label: string }
  | { kind: "ok"; label: string }
  | { kind: "error"; label: string; message: string }

// ─── The component ──────────────────────────────────────────────

export interface DiffPanelProps {
  taskId: string
  /** Base branch to target when opening a PR */
  baseBranch: string
}

export function DiffPanel({ taskId, baseBranch }: DiffPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [selected, setSelected] = useState<string | null>(null)
  const [original, setOriginal] = useState<string>("")
  const [modified, setModified] = useState<string>("")
  const [fileLoading, setFileLoading] = useState(false)

  const [commitMessage, setCommitMessage] = useState("")
  const [prTitle, setPrTitle] = useState("")
  const [prBody, setPrBody] = useState("")
  const [action, setAction] = useState<Action>({ kind: "idle" })

  const refresh = useCallback(async () => {
    setLoading(true)
    setStatusError(null)
    try {
      const res = await fetch(`/api/agent/git/${taskId}/status`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as GitStatus
      setStatus(data)
      if (data.files.length > 0 && !selected) {
        setSelected(data.files[0].path)
      }
      if (data.files.length === 0) {
        setSelected(null)
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "load failed")
    } finally {
      setLoading(false)
    }
  }, [taskId, selected])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Load diff for the selected file: grab "original" (HEAD) and "modified" (worktree).
  useEffect(() => {
    if (!selected) {
      setOriginal("")
      setModified("")
      return
    }
    let cancelled = false
    setFileLoading(true)
    ;(async () => {
      try {
        const [origRes, modRes] = await Promise.all([
          fetch(`/api/agent/git/${taskId}/file?path=${encodeURIComponent(selected)}`),
          fetch(`/api/agent/git/${taskId}/worktree?path=${encodeURIComponent(selected)}`),
        ])
        const origBody = origRes.ok ? await origRes.json() : { content: "", exists: false }
        const modBody = modRes.ok ? await modRes.json() : { content: "", exists: false }
        if (cancelled) return
        setOriginal(origBody.content ?? "")
        setModified(modBody.content ?? "")
      } catch {
        if (!cancelled) {
          setOriginal("")
          setModified("")
        }
      } finally {
        if (!cancelled) setFileLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected, taskId])

  // Load the unified diff text for the selected file to show raw diff fallback
  const [diffText, setDiffText] = useState<string>("")
  useEffect(() => {
    if (!selected) {
      setDiffText("")
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/agent/git/${taskId}/diff?path=${encodeURIComponent(selected)}`,
        )
        if (res.ok) {
          const body = await res.json()
          if (!cancelled) setDiffText(body.diff || "")
        }
      } catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [selected, taskId])

  const commit = async () => {
    if (!commitMessage.trim()) {
      setAction({ kind: "error", label: "commit", message: "需要提交信息" })
      return
    }
    setAction({ kind: "running", label: "commit" })
    try {
      const res = await fetch(`/api/agent/git/${taskId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMessage }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || body.error || "commit failed")
      setAction({ kind: "ok", label: "commit" })
      setCommitMessage("")
      await refresh()
    } catch (err) {
      setAction({
        kind: "error",
        label: "commit",
        message: err instanceof Error ? err.message : "commit failed",
      })
    }
  }

  const push = async () => {
    setAction({ kind: "running", label: "push" })
    try {
      const branch = status?.branch
      const res = await fetch(`/api/agent/git/${taskId}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || body.error || "push failed")
      setAction({ kind: "ok", label: "push" })
    } catch (err) {
      setAction({
        kind: "error",
        label: "push",
        message: err instanceof Error ? err.message : "push failed",
      })
    }
  }

  const openPr = async () => {
    if (!prTitle.trim()) {
      setAction({ kind: "error", label: "pr", message: "需要 PR 标题" })
      return
    }
    setAction({ kind: "running", label: "pr" })
    try {
      const res = await fetch(`/api/agent/pr/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: prTitle,
          body: prBody,
          head: status?.branch,
          base: baseBranch,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || body.error || "pr failed")
      setAction({ kind: "ok", label: "pr" })
      if (body.url) window.open(body.url, "_blank")
    } catch (err) {
      setAction({
        kind: "error",
        label: "pr",
        message: err instanceof Error ? err.message : "pr failed",
      })
    }
  }

  const selectedFile = useMemo(
    () => status?.files.find((f) => f.path === selected) ?? null,
    [status, selected],
  )

  const isUntracked = selectedFile?.index === "?" || selectedFile?.worktree === "?"
  const isDeleted = selectedFile?.worktree === "D" || selectedFile?.index === "D"

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Top bar */}
      <div className="h-9 flex items-center gap-3 px-4 text-xs border-b border-border bg-muted/30">
        {status ? (
          <>
            <span className="font-mono font-medium">{status.branch}</span>
            <span className="text-muted-foreground">
              {status.files.length} changed
              {status.ahead > 0 && ` · ↑${status.ahead}`}
              {status.behind > 0 && ` · ↓${status.behind}`}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">{statusError ?? "—"}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={refresh}
          disabled={loading}
          className="p-1 rounded hover:bg-accent disabled:opacity-50"
          title="刷新"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File list */}
        <div className="w-56 border-r border-border overflow-y-auto">
          {status?.files.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground text-center">没有变更</div>
          )}
          {status?.files.map((f) => (
            <button
              key={f.path}
              onClick={() => setSelected(f.path)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors",
                selected === f.path && "bg-accent",
              )}
            >
              <StatusIcon file={f} />
              <span className="truncate flex-1 font-mono">{f.path}</span>
            </button>
          ))}
        </div>

        {/* Diff viewer */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selected && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              选择一个文件查看 diff
            </div>
          )}
          {selected && fileLoading && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载…
            </div>
          )}
          {selected && !fileLoading && (isUntracked || isDeleted) && (
            <RawDiffView diffText={diffText} />
          )}
          {selected && !fileLoading && !isUntracked && !isDeleted && (
            <div className="flex-1 min-h-0">
              <DiffEditor
                original={original}
                modified={modified}
                language={guessLanguage(selected)}
                theme="vs-dark"
                height="100%"
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  diffWordWrap: "on",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Action panel */}
      <div className="border-t border-border p-3 space-y-2">
        <ActionBanner action={action} />

        <div className="flex gap-2 items-start">
          <input
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="commit message…"
            className="flex-1 px-3 py-1.5 text-xs bg-muted rounded-lg outline-none placeholder:text-muted-foreground"
          />
          <IconButton
            onClick={commit}
            disabled={!status?.files.length || !commitMessage.trim() || action.kind === "running"}
            icon={GitCommit}
            label="Commit"
          />
        </div>

        <div className="flex gap-2">
          <IconButton
            onClick={push}
            disabled={!status || action.kind === "running"}
            icon={Upload}
            label={`Push ${status?.branch ?? ""}`.trim()}
          />
          <div className="flex-1" />
        </div>

        <div className="pt-2 border-t border-border space-y-1.5">
          <input
            value={prTitle}
            onChange={(e) => setPrTitle(e.target.value)}
            placeholder="PR 标题"
            className="w-full px-3 py-1.5 text-xs bg-muted rounded-lg outline-none placeholder:text-muted-foreground"
          />
          <textarea
            value={prBody}
            onChange={(e) => setPrBody(e.target.value)}
            placeholder={`PR 描述（可选）→ ${baseBranch}`}
            rows={2}
            className="w-full px-3 py-1.5 text-xs bg-muted rounded-lg outline-none resize-none placeholder:text-muted-foreground"
          />
          <IconButton
            onClick={openPr}
            disabled={!prTitle.trim() || !status?.branch || action.kind === "running"}
            icon={GitPullRequest}
            label={`Open PR → ${baseBranch}`}
            primary
            full
          />
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function StatusIcon({ file }: { file: GitFile }) {
  const x = file.index
  const y = file.worktree
  if (x === "?" || y === "?")
    return <FilePlus2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
  if (x === "A" || y === "A")
    return <FilePlus2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
  if (x === "D" || y === "D")
    return <FileMinus2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
  return <FilePen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
}

function IconButton({
  onClick,
  disabled,
  icon: Icon,
  label,
  primary,
  full,
}: {
  onClick: () => void
  disabled?: boolean
  icon: typeof GitCommit
  label: string
  primary?: boolean
  full?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          : "bg-muted hover:bg-accent",
        full && "flex-1",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function ActionBanner({ action }: { action: Action }) {
  if (action.kind === "idle") return null
  if (action.kind === "running") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {action.label}…
      </div>
    )
  }
  if (action.kind === "ok") {
    return (
      <div className="flex items-center gap-2 text-xs text-green-600">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {action.label} 成功
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2 text-xs text-red-600">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>
        {action.label} 失败：{action.message}
      </span>
    </div>
  )
}

function RawDiffView({ diffText, embedded }: { diffText: string; embedded?: boolean }) {
  if (!diffText)
    return (
      <div className={cn(!embedded && "flex-1 flex", "items-center justify-center text-sm text-muted-foreground p-4")}>
        无 diff 输出
      </div>
    )
  return (
    <pre
      className={cn(
        "font-mono text-xs whitespace-pre overflow-auto",
        !embedded && "flex-1",
        embedded ? "max-h-[200px]" : "",
      )}
    >
      {diffText.split("\n").map((line, i) => (
        <div
          key={i}
          className={cn(
            "px-3",
            line.startsWith("+") && !line.startsWith("+++") && "bg-green-500/10 text-green-700 dark:text-green-300",
            line.startsWith("-") && !line.startsWith("---") && "bg-red-500/10 text-red-700 dark:text-red-300",
            line.startsWith("@@") && "bg-muted text-muted-foreground",
          )}
        >
          {line || " "}
        </div>
      ))}
    </pre>
  )
}

function guessLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
    sql: "sql",
    html: "html",
    css: "css",
  }
  return map[ext] ?? "plaintext"
}
