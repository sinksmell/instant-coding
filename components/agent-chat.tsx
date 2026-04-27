"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Send,
  Square,
  Sparkles,
  User as UserIcon,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Wrench,
  CheckCircle2,
  XCircle,
  Brain,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Protocol types (match ARCHITECTURE §5.3) ───────────────────

type ServerEvent =
  | { type: "session_created"; sessionId: string }
  | { type: "message"; role: "assistant"; content: string; isDelta: boolean; parentToolUseId?: string }
  | { type: "thinking"; content: string; signature?: string; parentToolUseId?: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown>; parentToolUseId?: string }
  | {
      type: "tool_result"
      id: string
      output: string
      isError: boolean
      parentToolUseId?: string
    }
  | {
      type: "permission_denied"
      denials: Array<{ toolName: string; toolUseId: string; input: Record<string, unknown> }>
    }
  | {
      type: "token_usage"
      input: number
      output: number
      cacheRead: number
      cacheWrite: number
    }
  | {
      type: "complete"
      exitCode: number
      turnStats?: {
        durationMs?: number
        durationApiMs?: number
        numTurns?: number
        totalCostUsd?: number
      }
    }
  | { type: "session_ended"; reason: string }
  | { type: "error"; code: string; message: string }
  | { type: "system"; subtype: string; raw?: unknown }

// ─── Chat-item types (UI display model) ─────────────────────────

type ChatItem =
  | { kind: "user"; content: string; ts: number }
  | { kind: "assistant"; content: string; ts: number; parentToolUseId?: string }
  | { kind: "thinking"; content: string; ts: number }
  | {
      kind: "tool"
      id: string
      name: string
      input: Record<string, unknown>
      result?: { output: string; isError: boolean }
      ts: number
      parentToolUseId?: string
    }
  | {
      kind: "permission_denied"
      denials: Array<{ toolName: string; toolUseId: string; input: Record<string, unknown> }>
      ts: number
    }
  | { kind: "error"; code: string; message: string; ts: number }

type ConnState = "connecting" | "ready" | "streaming" | "closed" | "error"

interface TurnStats {
  durationMs?: number
  totalCostUsd?: number
  numTurns?: number
}

interface TokenTotal {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  turns: number
}

// ─── The component ──────────────────────────────────────────────

export interface AgentChatProps {
  taskId: string
  /** Auto-sent on first ever visit (tracked in localStorage). */
  initialPrompt?: string
}

export function AgentChat({ taskId, initialPrompt }: AgentChatProps) {
  const [items, setItems] = useState<ChatItem[]>(() => {
    if (initialPrompt) {
      return [{ kind: "user", content: initialPrompt, ts: Date.now() }]
    }
    return []
  })
  const [input, setInput] = useState("")
  const [state, setState] = useState<ConnState>("connecting")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [tokenTotal, setTokenTotal] = useState<TokenTotal>({
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    turns: 0,
  })
  const [lastTurnStats, setLastTurnStats] = useState<TurnStats | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const appendItem = useCallback((item: ChatItem) => {
    setItems((prev) => [...prev, item])
  }, [])

  const attachToolResult = useCallback(
    (id: string, output: string, isError: boolean) => {
      setItems((prev) => {
        const next = [...prev]
        // find the most recent matching tool call
        for (let i = next.length - 1; i >= 0; i--) {
          const it = next[i]
          if (it.kind === "tool" && it.id === id) {
            next[i] = { ...it, result: { output, isError } }
            return next
          }
        }
        // tool_call never arrived — synthesize a placeholder
        next.push({
          kind: "tool",
          id,
          name: "unknown",
          input: {},
          result: { output, isError },
          ts: Date.now(),
        })
        return next
      })
    },
    [],
  )

  const handleEvent = useCallback(
    (evt: ServerEvent) => {
      switch (evt.type) {
        case "session_created":
          setSessionId(evt.sessionId)
          sessionIdRef.current = evt.sessionId
          break
        case "message":
          appendItem({
            kind: "assistant",
            content: evt.content,
            ts: Date.now(),
            parentToolUseId: evt.parentToolUseId,
          })
          break
        case "thinking":
          appendItem({ kind: "thinking", content: evt.content, ts: Date.now() })
          break
        case "tool_call":
          appendItem({
            kind: "tool",
            id: evt.id,
            name: evt.name,
            input: evt.input,
            ts: Date.now(),
            parentToolUseId: evt.parentToolUseId,
          })
          break
        case "tool_result":
          attachToolResult(evt.id, evt.output, evt.isError)
          break
        case "permission_denied":
          appendItem({ kind: "permission_denied", denials: evt.denials, ts: Date.now() })
          break
        case "token_usage":
          setTokenTotal((prev) => ({
            input: prev.input + evt.input,
            output: prev.output + evt.output,
            cacheRead: prev.cacheRead + evt.cacheRead,
            cacheWrite: prev.cacheWrite + evt.cacheWrite,
            turns: prev.turns,
          }))
          break
        case "complete":
          setLastTurnStats({
            durationMs: evt.turnStats?.durationMs,
            totalCostUsd: evt.turnStats?.totalCostUsd,
            numTurns: evt.turnStats?.numTurns,
          })
          setTokenTotal((prev) => ({ ...prev, turns: prev.turns + 1 }))
          setState("ready")
          break
        case "session_ended":
          setState("closed")
          break
        case "error":
          appendItem({
            kind: "error",
            code: evt.code,
            message: evt.message,
            ts: Date.now(),
          })
          setState((s) => (s === "streaming" ? "ready" : s))
          break
        case "system":
          // Diagnostic noise — only log
          if (typeof window !== "undefined") {
            // eslint-disable-next-line no-console
            console.debug("[agent-chat] system event", evt)
          }
          break
      }
    },
    [appendItem, attachToolResult],
  )

  // Connect WS on mount
  useEffect(() => {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws"
    const url = `${scheme}://${window.location.host}/api/agent/ws?taskId=${encodeURIComponent(taskId)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    const autoSentKey = `instant-coding:auto-sent:${taskId}`
    ws.onopen = () => {
      setState("ready")
      if (initialPrompt && typeof window !== "undefined") {
        const already = window.localStorage.getItem(autoSentKey)
        if (!already) {
          window.localStorage.setItem(autoSentKey, "1")
          ws.send(JSON.stringify({ type: "prompt", content: initialPrompt }))
          setState("streaming")
        }
      }
    }
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString())
        handleEvent(parsed as ServerEvent)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[agent-chat] parse error", err, ev.data)
      }
    }
    ws.onerror = () => setState("error")
    ws.onclose = (ev) => {
      setState((s) => (s === "error" ? s : "closed"))
      if (ev.code === 1011 || ev.code >= 4000) {
        appendItem({
          kind: "error",
          code: `ws_close_${ev.code}`,
          message: ev.reason || "connection closed abnormally",
          ts: Date.now(),
        })
      }
    }

    return () => {
      try {
        ws.close()
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  // Auto-scroll to bottom on new item
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [items, state])

  const canSend = state === "ready" && input.trim().length > 0
  const canAbort = state === "streaming"

  const submit = () => {
    const content = input.trim()
    if (!content || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    appendItem({ kind: "user", content, ts: Date.now() })
    const payload: Record<string, unknown> = { type: "prompt", content }
    if (sessionIdRef.current) payload.sessionId = sessionIdRef.current
    wsRef.current.send(JSON.stringify(payload))
    setInput("")
    setState("streaming")
  }

  const abort = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "abort" }))
    }
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Status bar */}
      <StatusBar state={state} sessionId={sessionId} tokenTotal={tokenTotal} lastTurnStats={lastTurnStats} />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {items.length === 0 && state === "ready" && (
          <div className="text-sm text-muted-foreground text-center py-12">
            会话已就绪，输入内容开始对话
          </div>
        )}
        {items.map((item, i) => (
          <ItemRow key={i} item={item} />
        ))}
        {state === "streaming" && <TypingIndicator />}
      </div>

      {/* Composer */}
      <Composer
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onAbort={abort}
        canSend={canSend}
        canAbort={canAbort}
        state={state}
      />
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

function StatusBar({
  state,
  sessionId,
  tokenTotal,
  lastTurnStats,
}: {
  state: ConnState
  sessionId: string | null
  tokenTotal: TokenTotal
  lastTurnStats: TurnStats | null
}) {
  return (
    <div className="h-9 flex items-center gap-3 px-4 text-xs border-b border-border bg-muted/30">
      <ConnIndicator state={state} />
      {sessionId && (
        <span className="text-muted-foreground font-mono truncate max-w-[140px]" title={sessionId}>
          {sessionId.slice(0, 8)}
        </span>
      )}
      <div className="flex-1" />
      {tokenTotal.turns > 0 && (
        <>
          <span className="text-muted-foreground">
            {tokenTotal.turns} 轮 · {(tokenTotal.input + tokenTotal.output).toLocaleString()} tokens
          </span>
          {tokenTotal.cacheRead > 0 && (
            <span className="text-green-600" title="cache hit input tokens">
              ↻ {tokenTotal.cacheRead.toLocaleString()}
            </span>
          )}
          {lastTurnStats?.totalCostUsd !== undefined && (
            <span className="text-muted-foreground font-mono">
              ${lastTurnStats.totalCostUsd.toFixed(4)}
            </span>
          )}
        </>
      )}
    </div>
  )
}

function ConnIndicator({ state }: { state: ConnState }) {
  const map = {
    connecting: { label: "连接中", Icon: Loader2, spin: true, color: "text-amber-500" },
    ready: { label: "就绪", Icon: Wifi, spin: false, color: "text-green-500" },
    streaming: { label: "生成中", Icon: Sparkles, spin: true, color: "text-primary" },
    closed: { label: "已断开", Icon: WifiOff, spin: false, color: "text-muted-foreground" },
    error: { label: "连接错误", Icon: AlertTriangle, spin: false, color: "text-red-500" },
  } as const
  const { label, Icon, spin, color } = map[state]
  return (
    <div className={cn("flex items-center gap-1.5", color)}>
      <Icon className={cn("w-3.5 h-3.5", spin && "animate-spin")} />
      <span>{label}</span>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <Avatar role="assistant" />
      <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  )
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "assistant") {
    return (
      <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
    )
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-muted text-foreground flex items-center justify-center flex-shrink-0">
      <UserIcon className="w-4 h-4" />
    </div>
  )
}

function ItemRow({ item }: { item: ChatItem }) {
  if (item.kind === "user") {
    return (
      <div className="flex gap-3 flex-row-reverse">
        <Avatar role="user" />
        <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-none px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {item.content}
        </div>
      </div>
    )
  }
  if (item.kind === "assistant") {
    return (
      <div className="flex gap-3">
        <Avatar role="assistant" />
        <div className="max-w-[80%] bg-muted rounded-2xl rounded-tl-none px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {item.content}
        </div>
      </div>
    )
  }
  if (item.kind === "thinking") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4" />
        </div>
        <details className="max-w-[80%] bg-muted/40 rounded-xl px-3 py-2 text-xs text-muted-foreground italic">
          <summary className="cursor-pointer select-none">extended thinking</summary>
          <pre className="mt-2 whitespace-pre-wrap not-italic">{item.content}</pre>
        </details>
      </div>
    )
  }
  if (item.kind === "tool") {
    return <ToolItem item={item} />
  }
  if (item.kind === "permission_denied") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="flex-1 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-xs">
          <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
            {item.denials.length} 个工具调用被权限策略阻止
          </div>
          <ul className="space-y-0.5 text-muted-foreground font-mono">
            {item.denials.map((d, i) => (
              <li key={i}>
                {d.toolName}: <span className="text-foreground">{JSON.stringify(d.input).slice(0, 120)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }
  // error
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-600 flex items-center justify-center flex-shrink-0">
        <XCircle className="w-4 h-4" />
      </div>
      <div className="flex-1 bg-red-500/5 border border-red-500/30 rounded-xl px-3 py-2 text-xs">
        <div className="font-mono text-red-600 dark:text-red-400 mb-0.5">{item.code}</div>
        <div className="text-muted-foreground">{item.message}</div>
      </div>
    </div>
  )
}

function ToolItem({
  item,
}: {
  item: Extract<ChatItem, { kind: "tool" }>
}) {
  const [open, setOpen] = useState(false)
  const summary = useMemo(() => {
    const keys = Object.keys(item.input)
    if (keys.length === 0) return ""
    const firstValue = item.input[keys[0]]
    const v = typeof firstValue === "string" ? firstValue : JSON.stringify(firstValue)
    return ` ${keys[0]}: ${v}`.slice(0, 100)
  }, [item.input])

  const statusIcon = !item.result ? (
    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
  ) : item.result.isError ? (
    <XCircle className="w-3.5 h-3.5 text-red-500" />
  ) : (
    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
  )

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
        <Wrench className="w-4 h-4" />
      </div>
      <div className="flex-1 border border-border rounded-xl overflow-hidden bg-card">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className="font-mono font-medium">{item.name}</span>
          <span className="text-muted-foreground truncate flex-1">{summary}</span>
          {statusIcon}
        </button>
        {open && (
          <div className="border-t border-border bg-muted/30 px-3 py-2 space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">input</div>
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(item.input, null, 2)}
              </pre>
            </div>
            {item.result && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {item.result.isError ? "error" : "output"}
                </div>
                <pre
                  className={cn(
                    "text-xs font-mono whitespace-pre-wrap break-all max-h-[320px] overflow-y-auto",
                    item.result.isError && "text-red-600 dark:text-red-400",
                  )}
                >
                  {item.result.output}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Composer({
  value,
  onChange,
  onSubmit,
  onAbort,
  canSend,
  canAbort,
  state,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onAbort: () => void
  canSend: boolean
  canAbort: boolean
  state: ConnState
}) {
  const disabledReason =
    state === "connecting"
      ? "正在连接…"
      : state === "closed"
      ? "连接已关闭，刷新页面重连"
      : state === "error"
      ? "连接错误"
      : null

  return (
    <div className="border-t border-border p-4">
      <div
        className={cn(
          "flex items-end gap-2 bg-muted rounded-xl px-3 py-2",
          disabledReason && "opacity-60",
        )}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder={disabledReason ?? "输入消息，Enter 发送，Shift+Enter 换行"}
          disabled={Boolean(disabledReason)}
          className="flex-1 bg-transparent text-sm outline-none resize-none max-h-40 placeholder:text-muted-foreground py-1.5"
          rows={1}
        />
        {canAbort ? (
          <button
            onClick={onAbort}
            className="p-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
            title="中断当前回合"
          >
            <Square className="w-4 h-4" fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!canSend}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
