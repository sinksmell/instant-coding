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
  | {
      type: "message"
      role: "assistant" | "user"
      content: string
      isDelta: boolean
      blockIndex?: number
      parentToolUseId?: string
    }
  | { type: "block_stop"; blockIndex?: number }
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
      type: "permission_request"
      requestId: string
      toolName: string
      input: Record<string, unknown>
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
  | {
      kind: "assistant"
      content: string
      ts: number
      parentToolUseId?: string
      /** While streaming, points at the SDK block index so deltas can find us */
      streamingBlockIndex?: number
    }
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
      kind: "permission_request"
      requestId: string
      toolName: string
      input: Record<string, unknown>
      decision?: "allow" | "deny"
      ts: number
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

// ─── Assistant-streaming helpers ────────────────────────────────

/**
 * Handle an incoming `message` event from the server, merging delta chunks
 * into the most recent matching streaming assistant item.
 *
 *  - isDelta=true, same blockIndex as an open streamer → append
 *  - isDelta=true, no open streamer → start a new streaming assistant item
 *  - isDelta=false, matching open streamer → finalize (replace content, drop
 *    streamingBlockIndex). This is the authoritative text; any concatenation
 *    drift gets corrected here.
 *  - isDelta=false, no matching streamer → plain new assistant bubble
 */
function appendAssistantContent(
  setItems: React.Dispatch<React.SetStateAction<ChatItem[]>>,
  evt: Extract<ServerEvent, { type: "message" }>,
) {
  const ts = Date.now()
  setItems((prev) => {
    const next = [...prev]
    const idx = findStreamingIndex(next, evt.blockIndex, evt.parentToolUseId)
    if (evt.isDelta) {
      if (idx >= 0) {
        const existing = next[idx] as Extract<ChatItem, { kind: "assistant" }>
        next[idx] = { ...existing, content: existing.content + evt.content }
      } else {
        next.push({
          kind: "assistant",
          content: evt.content,
          ts,
          parentToolUseId: evt.parentToolUseId,
          streamingBlockIndex: evt.blockIndex ?? 0,
        })
      }
    } else {
      if (idx >= 0) {
        const existing = next[idx] as Extract<ChatItem, { kind: "assistant" }>
        next[idx] = {
          ...existing,
          content: evt.content,
          streamingBlockIndex: undefined,
        }
      } else {
        next.push({
          kind: "assistant",
          content: evt.content,
          ts,
          parentToolUseId: evt.parentToolUseId,
        })
      }
    }
    return next
  })
}

function finalizeStreamingBlock(
  setItems: React.Dispatch<React.SetStateAction<ChatItem[]>>,
  blockIndex: number | undefined,
) {
  setItems((prev) => {
    const idx = findStreamingIndex(prev, blockIndex)
    if (idx < 0) return prev
    const next = [...prev]
    const existing = next[idx] as Extract<ChatItem, { kind: "assistant" }>
    next[idx] = { ...existing, streamingBlockIndex: undefined }
    return next
  })
}

/**
 * Walk a normalized event stream (e.g. returned by /api/agent/history) and
 * build up the ChatItem[] they would produce if replayed live.
 * Skips lifecycle events (session_created, complete, block_stop, etc.) that
 * aren't meaningful when just rehydrating past turns.
 */
function eventsToItems(events: ServerEvent[]): ChatItem[] {
  const items: ChatItem[] = []
  for (const evt of events) {
    switch (evt.type) {
      case "message":
        if (evt.role === "user") {
          items.push({ kind: "user", content: evt.content, ts: Date.now() })
        } else {
          items.push({
            kind: "assistant",
            content: evt.content,
            ts: Date.now(),
            parentToolUseId: evt.parentToolUseId,
          })
        }
        break
      case "thinking":
        items.push({
          kind: "thinking",
          content: evt.content,
          ts: Date.now(),
        })
        break
      case "tool_call":
        items.push({
          kind: "tool",
          id: evt.id,
          name: evt.name,
          input: evt.input,
          ts: Date.now(),
          parentToolUseId: evt.parentToolUseId,
        })
        break
      case "tool_result": {
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i]
          if (it.kind === "tool" && it.id === evt.id) {
            items[i] = { ...it, result: { output: evt.output, isError: evt.isError } }
            break
          }
        }
        break
      }
      case "permission_denied":
        items.push({ kind: "permission_denied", denials: evt.denials, ts: Date.now() })
        break
      case "error":
        items.push({ kind: "error", code: evt.code, message: evt.message, ts: Date.now() })
        break
      // Everything else (session_created, complete, session_ended,
      // token_usage, block_stop, system, permission_request) is lifecycle
      // noise for replay and gets dropped.
      default:
        break
    }
  }
  return items
}

function findStreamingIndex(
  items: ChatItem[],
  blockIndex: number | undefined,
  parentToolUseId?: string,
): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.kind !== "assistant") continue
    if (it.streamingBlockIndex === undefined) return -1 // last assistant was finalized; start fresh
    if (
      (blockIndex === undefined || it.streamingBlockIndex === blockIndex) &&
      (parentToolUseId ?? undefined) === (it.parentToolUseId ?? undefined)
    ) {
      return i
    }
    return -1
  }
  return -1
}

// ─── The component ──────────────────────────────────────────────

export interface AgentChatProps {
  taskId: string
  /** Auto-sent on first ever visit (tracked in localStorage). */
  initialPrompt?: string
  /** Called whenever a new sessionId is captured from the runtime */
  onSessionIdChange?: (sessionId: string) => void
}

export function AgentChat({ taskId, initialPrompt, onSessionIdChange }: AgentChatProps) {
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
          onSessionIdChange?.(evt.sessionId)
          // Persist so a refresh or back-nav can call /agent/history to
          // rehydrate the prior conversation.
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              `instant-coding:session:${taskId}`,
              evt.sessionId,
            )
          }
          break
        case "message":
          if (evt.role === "user") {
            appendItem({ kind: "user", content: evt.content, ts: Date.now() })
          } else {
            appendAssistantContent(setItems, evt)
          }
          break
        case "block_stop":
          finalizeStreamingBlock(setItems, evt.blockIndex)
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
        case "permission_request":
          appendItem({
            kind: "permission_request",
            requestId: evt.requestId,
            toolName: evt.toolName,
            input: evt.input,
            ts: Date.now(),
          })
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

  // Connect WS on mount, after hydrating past history if any
  useEffect(() => {
    const sessionKey = `instant-coding:session:${taskId}`
    const autoSentKey = `instant-coding:auto-sent:${taskId}`
    let priorSessionId: string | null = null
    if (typeof window !== "undefined") {
      priorSessionId = window.localStorage.getItem(sessionKey)
    }

    let cancelled = false
    ;(async () => {
      // Try to hydrate from the on-disk session file first. On success, the
      // prior conversation appears instantly before the WS opens.
      if (priorSessionId) {
        try {
          const res = await fetch(
            `/api/agent/history/${encodeURIComponent(taskId)}?sessionId=${encodeURIComponent(priorSessionId)}`,
          )
          if (res.ok) {
            const data = (await res.json()) as { events: ServerEvent[] }
            const hydrated = eventsToItems(data.events)
            if (!cancelled && hydrated.length > 0) {
              setItems(hydrated)
              setSessionId(priorSessionId)
              sessionIdRef.current = priorSessionId
              onSessionIdChange?.(priorSessionId)
            }
          }
        } catch {
          /* fall through to a fresh session */
        }
      }
      if (cancelled) return

      const scheme = window.location.protocol === "https:" ? "wss" : "ws"
      const url = `${scheme}://${window.location.host}/api/agent/ws?taskId=${encodeURIComponent(taskId)}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setState("ready")
        // Auto-send the initial prompt only the very first time (no stored
        // session, no auto-sent flag). Resumed sessions wait for the user.
        if (
          initialPrompt &&
          !priorSessionId &&
          typeof window !== "undefined" &&
          !window.localStorage.getItem(autoSentKey)
        ) {
          window.localStorage.setItem(autoSentKey, "1")
          ws.send(JSON.stringify({ type: "prompt", content: initialPrompt }))
          setState("streaming")
        }
      }
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(
            typeof ev.data === "string" ? ev.data : ev.data.toString(),
          )
          handleEvent(parsed as ServerEvent)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[agent-chat] parse error", err, ev.data)
        }
      }
      ws.onerror = () => setState("error")
      ws.onclose = (event) => {
        setState((s) => (s === "error" ? s : "closed"))
        if (event.code === 1011 || event.code >= 4000) {
          appendItem({
            kind: "error",
            code: `ws_close_${event.code}`,
            message: event.reason || "connection closed abnormally",
            ts: Date.now(),
          })
        }
      }
    })()

    return () => {
      cancelled = true
      try {
        wsRef.current?.close()
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

  const sendPermissionDecision = useCallback((requestId: string, allow: boolean) => {
    const ws = wsRef.current
    if (ws?.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: "permission_decision", requestId, allow }))
    // Mark the item so the UI locks the buttons
    setItems((prev) =>
      prev.map((it) =>
        it.kind === "permission_request" && it.requestId === requestId
          ? { ...it, decision: allow ? "allow" : "deny" }
          : it,
      ),
    )
  }, [])

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Status bar */}
      <StatusBar state={state} sessionId={sessionId} tokenTotal={tokenTotal} lastTurnStats={lastTurnStats} />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {items.length === 0 && state === "ready" && (
          <div className="text-sm text-muted-foreground text-center py-12">
            环境已就绪。说你想写点什么，Claude 立刻动手。
          </div>
        )}
        {items.map((item, i) => {
          // Visual nesting for subagent output: if this item belongs to a
          // parent tool_use (Task subagent), indent it so it reads as a
          // branch of that tool card above it.
          const nested =
            "parentToolUseId" in item && typeof item.parentToolUseId === "string"
          return (
            <div
              key={i}
              className={cn(
                nested && "pl-6 border-l-2 border-violet-400/25 ml-4",
              )}
            >
              <ItemRow item={item} onPermissionDecision={sendPermissionDecision} />
            </div>
          )
        })}
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

function ItemRow({
  item,
  onPermissionDecision,
}: {
  item: ChatItem
  onPermissionDecision?: (requestId: string, allow: boolean) => void
}) {
  if (item.kind === "user") {
    // Asymmetric corner (rounded-br-md) per claudecodeui — gives the bubble a
    // visual "pointer" toward the avatar without needing an actual arrow.
    return (
      <div className="flex gap-3 flex-row-reverse">
        <Avatar role="user" />
        <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
          {item.content}
        </div>
      </div>
    )
  }
  if (item.kind === "assistant") {
    return (
      <div className="flex gap-3">
        <Avatar role="assistant" />
        <div className="max-w-[80%] bg-muted rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {item.content}
        </div>
      </div>
    )
  }
  if (item.kind === "thinking") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted/60 text-muted-foreground flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4" />
        </div>
        <details className="max-w-[80%] bg-muted/30 border-l-2 border-violet-400/40 rounded-r-xl px-3 py-2 text-xs text-muted-foreground italic">
          <summary className="cursor-pointer select-none hover:text-foreground transition-colors">
            extended thinking
          </summary>
          <pre className="mt-2 whitespace-pre-wrap not-italic font-mono leading-relaxed">{item.content}</pre>
        </details>
      </div>
    )
  }
  if (item.kind === "tool") {
    return <ToolItem item={item} />
  }
  if (item.kind === "permission_request") {
    return <PermissionRequestRow item={item} onDecision={onPermissionDecision} />
  }
  if (item.kind === "permission_denied") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="flex-1 bg-amber-500/10 border-l-2 border-amber-500/60 rounded-r-xl px-3 py-2 text-xs">
          <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">
            {item.denials.length} 个工具调用被权限策略阻止
          </div>
          <ul className="space-y-0.5 text-muted-foreground font-mono">
            {item.denials.map((d, i) => (
              <li key={i} className="truncate">
                <span className="text-amber-700 dark:text-amber-400">{d.toolName}</span>
                <span className="text-muted-foreground">: </span>
                <span className="text-foreground">{JSON.stringify(d.input).slice(0, 120)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }
  if (item.kind === "error") {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-600 flex items-center justify-center flex-shrink-0">
          <XCircle className="w-4 h-4" />
        </div>
        <div className="flex-1 bg-red-500/5 border-l-2 border-red-500/60 rounded-r-xl px-3 py-2 text-xs">
          <div className="font-mono text-red-600 dark:text-red-400 mb-0.5">{item.code}</div>
          <div className="text-muted-foreground">{item.message}</div>
        </div>
      </div>
    )
  }
  return null
}

function PermissionRequestRow({
  item,
  onDecision,
}: {
  item: Extract<ChatItem, { kind: "permission_request" }>
  onDecision?: (requestId: string, allow: boolean) => void
}) {
  const accent = toolAccent(item.toolName)
  const decided = item.decision !== undefined
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
        <Wrench className="w-4 h-4" />
      </div>
      <div
        className={cn(
          "flex-1 border border-border bg-card rounded-xl overflow-hidden",
          "border-l-2",
          accent.border,
        )}
      >
        <div className="px-3 py-2 text-xs space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn("font-mono font-medium", accent.text)}>{item.toolName}</span>
            <span className="text-muted-foreground">请求运行</span>
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed text-muted-foreground bg-muted/40 rounded p-2 max-h-[180px] overflow-y-auto">
            {JSON.stringify(item.input, null, 2)}
          </pre>
          {!decided ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDecision?.(item.requestId, true)}
                className="flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 active:scale-[0.97] transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> 允许
              </button>
              <button
                onClick={() => onDecision?.(item.requestId, false)}
                className="flex items-center gap-1 px-3 py-1 rounded-md bg-muted text-foreground text-xs font-medium hover:bg-accent active:scale-[0.97] transition-all"
              >
                <XCircle className="w-3.5 h-3.5" /> 拒绝
              </button>
              <span className="text-[10px] text-muted-foreground ml-auto">55s 内不回应自动拒绝</span>
            </div>
          ) : (
            <div
              className={cn(
                "text-xs",
                item.decision === "allow" ? "text-green-600" : "text-muted-foreground",
              )}
            >
              {item.decision === "allow" ? "已允许" : "已拒绝"}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Map Claude tool names to a category color used for the left-border accent
 * on tool cards. Matches claudecodeui's semantic palette roughly:
 *   green  — read-only / inspection
 *   amber  — writes / edits
 *   violet — subagents / meta
 *   sky    — shell / bash
 *   muted  — everything else
 */
function toolAccent(name: string): { border: string; text: string } {
  const n = name.toLowerCase()
  if (n === "bash" || n.startsWith("shell")) return { border: "border-l-sky-400", text: "text-sky-400" }
  if (n === "edit" || n === "write" || n === "multiedit" || n === "notebookedit")
    return { border: "border-l-amber-400", text: "text-amber-400" }
  if (n === "task") return { border: "border-l-violet-400", text: "text-violet-400" }
  if (n === "read" || n === "glob" || n === "grep" || n === "ls" || n === "webfetch" || n === "websearch")
    return { border: "border-l-emerald-400", text: "text-emerald-400" }
  return { border: "border-l-muted-foreground/40", text: "text-muted-foreground" }
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

  const accent = toolAccent(item.name)
  const statusIcon = !item.result ? (
    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
  ) : item.result.isError ? (
    <XCircle className="w-3.5 h-3.5 text-red-500" />
  ) : (
    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
  )

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-muted/60 text-muted-foreground flex items-center justify-center flex-shrink-0">
        <Wrench className="w-4 h-4" />
      </div>
      <div
        className={cn(
          "flex-1 border border-border rounded-xl overflow-hidden bg-card border-l-2",
          accent.border,
        )}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/60 active:scale-[0.995] transition-all text-left"
        >
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className={cn("font-mono font-medium", accent.text)}>{item.name}</span>
          <span className="text-muted-foreground truncate flex-1">{summary}</span>
          {statusIcon}
        </button>
        {open && (
          <div className="border-t border-border bg-muted/30 px-3 py-2 space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">input</div>
              <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
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
                    "text-xs font-mono whitespace-pre-wrap break-all max-h-[320px] overflow-y-auto leading-relaxed",
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
            className="p-2 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 active:scale-95 transition-all"
            title="中断当前回合"
          >
            <Square className="w-4 h-4" fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!canSend}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
