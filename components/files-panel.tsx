"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  ChevronRight,
  ChevronDown,
  File as FileIcon,
  Folder,
  FolderOpen,
  RefreshCw,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin mr-2" />
      加载 Monaco…
    </div>
  ),
})

// ─── Types ──────────────────────────────────────────────────────

interface TreeNode {
  name: string
  path: string
  type: "dir" | "file"
  size?: number
  children?: TreeNode[]
  truncated?: boolean
}

interface FileRead {
  exists: boolean
  content: string
  size: number
  mtime: number
  binary: boolean
}

type SaveState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string }

// ─── The component ──────────────────────────────────────────────

export interface FilesPanelProps {
  taskId: string
}

export function FilesPanel({ taskId }: FilesPanelProps) {
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]))

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  const [loadedContent, setLoadedContent] = useState<string>("")
  const [buffer, setBuffer] = useState<string>("")
  const [binary, setBinary] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>({ kind: "clean" })

  const bufferRef = useRef(buffer)
  bufferRef.current = buffer
  const selectedRef = useRef<string | null>(selectedPath)
  selectedRef.current = selectedPath

  const refreshTree = useCallback(async () => {
    setTreeLoading(true)
    setTreeError(null)
    try {
      const res = await fetch(`/api/agent/fs/${taskId}/tree`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as TreeNode
      setTree(data)
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : "load failed")
    } finally {
      setTreeLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    refreshTree()
  }, [refreshTree])

  // Load a file when the user picks one (and it's different from what's loaded)
  useEffect(() => {
    if (!selectedPath || selectedPath === loadedPath) return
    let cancelled = false
    setReadError(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/agent/fs/${taskId}/read?path=${encodeURIComponent(selectedPath)}`,
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.message || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as FileRead
        if (cancelled) return
        if (!data.exists) {
          setReadError("文件不存在")
          return
        }
        setBinary(data.binary)
        setLoadedPath(selectedPath)
        setLoadedContent(data.content)
        setBuffer(data.content)
        setSaveState({ kind: "clean" })
      } catch (err) {
        if (!cancelled) setReadError(err instanceof Error ? err.message : "read failed")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedPath, loadedPath, taskId])

  const save = useCallback(async () => {
    const path = selectedRef.current
    if (!path) return
    setSaveState({ kind: "saving" })
    try {
      const res = await fetch(`/api/agent/fs/${taskId}/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: bufferRef.current }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.message || body.error || "write failed")
      setLoadedContent(bufferRef.current)
      setSaveState({ kind: "saved" })
      // after a moment, return to clean (until user types again)
      window.setTimeout(() => {
        setSaveState((s) => (s.kind === "saved" ? { kind: "clean" } : s))
      }, 1500)
    } catch (err) {
      setSaveState({ kind: "error", message: err instanceof Error ? err.message : "write failed" })
    }
  }, [taskId])

  // Cmd/Ctrl+S to save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        if (saveState.kind === "dirty" || saveState.kind === "error") save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [save, saveState.kind])

  const toggleExpanded = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const dirty = buffer !== loadedContent

  // keep saveState and dirty flag in sync (typing makes dirty true)
  useEffect(() => {
    if (dirty && saveState.kind === "clean") setSaveState({ kind: "dirty" })
    if (!dirty && saveState.kind === "dirty") setSaveState({ kind: "clean" })
  }, [dirty, saveState.kind])

  const selectedLanguage = useMemo(() => guessLanguage(loadedPath ?? ""), [loadedPath])

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Top bar */}
      <div className="h-9 flex items-center gap-3 px-4 text-xs border-b border-border bg-muted/30">
        {loadedPath ? (
          <span className="font-mono truncate max-w-[320px]" title={loadedPath}>
            {loadedPath}
            {dirty && <span className="text-amber-500 ml-1">●</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">{treeError ?? "选择文件以查看"}</span>
        )}
        <div className="flex-1" />
        <SaveStateBadge state={saveState} />
        <button
          onClick={save}
          disabled={saveState.kind !== "dirty" && saveState.kind !== "error"}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="保存 (Cmd/Ctrl+S)"
        >
          <Save className="w-3.5 h-3.5" />
          Save
        </button>
        <button
          onClick={refreshTree}
          disabled={treeLoading}
          className="p-1 rounded hover:bg-accent disabled:opacity-50"
          title="刷新文件树"
        >
          {treeLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Tree */}
        <div className="w-64 border-r border-border overflow-y-auto text-xs">
          {tree ? (
            <TreeRow
              node={tree}
              depth={0}
              expanded={expanded}
              selected={selectedPath}
              onToggle={toggleExpanded}
              onSelect={setSelectedPath}
            />
          ) : treeLoading ? (
            <div className="p-4 text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中
            </div>
          ) : (
            <div className="p-4 text-muted-foreground">{treeError ?? "—"}</div>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-0 flex flex-col">
          {!selectedPath && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              选择文件查看或编辑
            </div>
          )}
          {selectedPath && readError && (
            <div className="flex-1 flex items-center justify-center text-sm text-red-500">
              {readError}
            </div>
          )}
          {selectedPath && !readError && binary && (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              二进制文件，未显示内容
            </div>
          )}
          {selectedPath && !readError && !binary && loadedPath && (
            <div className="flex-1 min-h-0">
              <MonacoEditor
                value={buffer}
                onChange={(v) => setBuffer(v ?? "")}
                language={selectedLanguage}
                theme="vs-dark"
                path={loadedPath}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  automaticLayout: true,
                  tabSize: 2,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tree row (recursive) ──────────────────────────────────────

function TreeRow({
  node,
  depth,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  selected: string | null
  onToggle: (path: string) => void
  onSelect: (path: string) => void
}) {
  const isOpen = expanded.has(node.path)
  const isRoot = depth === 0
  const isDir = node.type === "dir"
  const isSelected = node.path === selected

  // Don't render the synthetic root as a clickable row — render only its children
  const indentStyle = { paddingLeft: `${depth * 10 + 8}px` }

  return (
    <>
      {!isRoot && (
        <button
          onClick={() => (isDir ? onToggle(node.path) : onSelect(node.path))}
          className={cn(
            "w-full flex items-center gap-1 py-1 pr-2 hover:bg-accent text-left",
            isSelected && "bg-accent",
          )}
          style={indentStyle}
        >
          {isDir ? (
            isOpen ? (
              <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3 h-3 shrink-0" />
          )}
          {isDir ? (
            isOpen ? (
              <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            ) : (
              <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            )
          ) : (
            <FileIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-mono">{node.name}</span>
        </button>
      )}
      {isDir && (isRoot || isOpen) && node.children?.map((child) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          selected={selected}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function SaveStateBadge({ state }: { state: SaveState }) {
  if (state.kind === "clean") return null
  if (state.kind === "dirty")
    return <span className="text-amber-500 text-xs">未保存</span>
  if (state.kind === "saving")
    return (
      <span className="flex items-center gap-1 text-muted-foreground text-xs">
        <Loader2 className="w-3 h-3 animate-spin" /> 保存中
      </span>
    )
  if (state.kind === "saved")
    return (
      <span className="flex items-center gap-1 text-green-600 text-xs">
        <CheckCircle2 className="w-3 h-3" /> 已保存
      </span>
    )
  return (
    <span className="flex items-center gap-1 text-red-500 text-xs" title={state.message}>
      <AlertTriangle className="w-3 h-3" /> 失败
    </span>
  )
}

function guessLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
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
    cc: "cpp",
    c: "c",
    h: "c",
    hpp: "cpp",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    sql: "sql",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    vue: "html",
    svelte: "html",
    dockerfile: "dockerfile",
  }
  if (path.toLowerCase().endsWith("dockerfile")) return "dockerfile"
  return map[ext] ?? "plaintext"
}
