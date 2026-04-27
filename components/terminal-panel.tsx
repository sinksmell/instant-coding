"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Play, WifiOff, AlertTriangle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import "@xterm/xterm/css/xterm.css"

type ConnState = "connecting" | "open" | "closed" | "error"

export interface TerminalPanelProps {
  taskId: string
  /** Optional session id to resume — if set, the "Resume Claude" button appears */
  claudeSessionId?: string | null
}

export function TerminalPanel({ taskId, claudeSessionId }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<unknown>(null)
  const fitRef = useRef<unknown>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [state, setState] = useState<ConnState>("connecting")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Track whether xterm has been mounted so we don't double-init under StrictMode
  const mountedRef = useRef(false)

  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true

    let disposed = false

    ;(async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ])
      if (disposed || !containerRef.current) return

      const term = new Terminal({
        cursorBlink: true,
        convertEol: false,
        fontFamily:
          'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
        theme: {
          background: "#0b0b0f",
          foreground: "#e6e6e6",
          cursor: "#e6e6e6",
          black: "#1a1a1a",
          brightBlack: "#666",
        },
        scrollback: 5000,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current)
      try {
        fit.fit()
      } catch {}

      termRef.current = term
      fitRef.current = fit

      // ── Open WS ─────────────────────────────────────
      const scheme = window.location.protocol === "https:" ? "wss" : "ws"
      const url = `${scheme}://${window.location.host}/api/agent/shell/ws?taskId=${encodeURIComponent(taskId)}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setState("open")
        // Inform server of our initial size
        const { cols, rows } = term
        ws.send(JSON.stringify({ type: "resize", cols, rows }))
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString())
          if (msg.type === "output" && typeof msg.data === "string") {
            term.write(msg.data)
          } else if (msg.type === "exit") {
            term.writeln(`\r\n\x1b[90m[process exited code=${msg.code ?? "null"}]\x1b[0m`)
          } else if (msg.type === "error") {
            term.writeln(`\r\n\x1b[31m[${msg.code}] ${msg.message}\x1b[0m`)
            setErrorMsg(msg.message || msg.code)
          }
        } catch {}
      }
      ws.onerror = () => {
        setState("error")
      }
      ws.onclose = (ev) => {
        setState((s) => (s === "error" ? s : "closed"))
        if (ev.code >= 4000 && ev.reason) setErrorMsg(ev.reason)
      }

      // ── Forward keystrokes ─────────────────────────
      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }))
        }
      })

      // ── Resize on container change ─────────────────
      const ro = new ResizeObserver(() => {
        try {
          fit.fit()
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
          }
        } catch {}
      })
      ro.observe(containerRef.current)

      // cleanup is via outer disposed flag + close
      ;(term as unknown as { __ro?: ResizeObserver }).__ro = ro
    })()

    return () => {
      disposed = true
      const term = termRef.current as
        | { __ro?: ResizeObserver; dispose: () => void }
        | undefined
      try {
        term?.__ro?.disconnect()
        term?.dispose()
      } catch {}
      try {
        wsRef.current?.close()
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  const sendInput = (data: string) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", data }))
    }
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Top bar */}
      <div className="h-9 flex items-center gap-2 px-4 text-xs border-b border-border bg-muted/30">
        <StateBadge state={state} />
        {errorMsg && (
          <span className="text-red-500 truncate max-w-[240px]" title={errorMsg}>
            {errorMsg}
          </span>
        )}
        <div className="flex-1" />
        {claudeSessionId && (
          <button
            onClick={() => sendInput(`claude --resume ${claudeSessionId}\n`)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted hover:bg-accent transition-colors"
            title={`在终端里接管 session ${claudeSessionId}`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Resume Claude
          </button>
        )}
        <button
          onClick={() => sendInput("\x0c")}
          className="p-1 rounded hover:bg-accent"
          title="Clear (Ctrl+L)"
        >
          <Play className="w-3.5 h-3.5 rotate-180" />
        </button>
      </div>

      {/* Terminal area */}
      <div className="flex-1 min-h-0 bg-[#0b0b0f]">
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
}

function StateBadge({ state }: { state: ConnState }) {
  const cfg = {
    connecting: { label: "连接中", color: "text-amber-500", Icon: Loader2, spin: true },
    open: { label: "就绪", color: "text-green-500", Icon: Play, spin: false },
    closed: { label: "已断开", color: "text-muted-foreground", Icon: WifiOff, spin: false },
    error: { label: "错误", color: "text-red-500", Icon: AlertTriangle, spin: false },
  } as const
  const { label, color, Icon, spin } = cfg[state]
  return (
    <div className={cn("flex items-center gap-1.5", color)}>
      <Icon className={cn("w-3.5 h-3.5", spin && "animate-spin")} />
      <span>{label}</span>
    </div>
  )
}
