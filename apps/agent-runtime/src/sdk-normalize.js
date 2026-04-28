/**
 * Normalize messages yielded by @anthropic-ai/claude-agent-sdk's query()
 * into the WS protocol documented in ARCHITECTURE §5.3.
 *
 * Observed SDK message kinds (empirically confirmed against claudecodeui
 * server/modules/providers/list/claude/claude-sessions.provider.ts):
 *   { type: "content_block_delta", delta: { text, ... }, ... }
 *   { type: "content_block_stop", ... }
 *   { type: "system", subtype: "init" | "hook_*", session_id, ... }
 *   { type: "assistant", message: { content: [{type:"text"|"tool_use"|"thinking",...}] }, parent_tool_use_id, session_id }
 *   { type: "user", message: { content: [{type:"tool_result",...}] }, parent_tool_use_id, session_id }
 *   { type: "result", usage, total_cost_usd, duration_ms, permission_denials, ... }
 */

// Claude Code writes bookkeeping entries into the on-disk jsonl so the CLI
// can reconstruct hidden context — we filter them out of replay so the chat
// view shows only what a human saw.
const INTERNAL_USER_PREFIXES = [
  "<command-name>",
  "<command-message>",
  "<command-args>",
  "<local-command-stdout>",
  "<system-reminder>",
  "Caveat:",
  "This session is being continued from a previous",
  "[Request interrupted",
]
function isInternalUserText(text) {
  for (const p of INTERNAL_USER_PREFIXES) if (text.startsWith(p)) return true
  return false
}

export function normalize(event) {
  if (!event || typeof event !== "object") return []

  // ── Streaming text deltas ──────────────────────────────────
  if (event.type === "content_block_delta") {
    const text = event.delta?.text
    if (typeof text === "string" && text.length > 0) {
      return [
        {
          type: "message",
          role: "assistant",
          content: text,
          isDelta: true,
          blockIndex: event.index,
        },
      ]
    }
    return []
  }

  if (event.type === "content_block_stop") {
    return [{ type: "block_stop", blockIndex: event.index }]
  }

  // ── System lifecycle ───────────────────────────────────────
  if (event.type === "system" && event.subtype === "init") {
    // session_created handled at the caller level (dedupe across turns).
    // Forward as raw for diagnostics.
    return [{ type: "system", subtype: "init", raw: event }]
  }

  if (event.type === "system") {
    return [{ type: "system", subtype: event.subtype, raw: event }]
  }

  const parentId = event.parent_tool_use_id || undefined

  // ── Assistant message (text / tool_use / thinking) ─────────
  // Emitted as complete blocks; per-character streaming comes via
  // content_block_delta above. Clients should treat these as the
  // authoritative final block state (replaces any accumulated deltas).
  if (event.type === "assistant" && event.message?.content) {
    const out = []
    for (const block of event.message.content) {
      if (block.type === "text") {
        out.push({
          type: "message",
          role: "assistant",
          content: block.text,
          isDelta: false,
          parentToolUseId: parentId,
        })
      } else if (block.type === "tool_use") {
        out.push({
          type: "tool_call",
          id: block.id,
          name: block.name,
          input: block.input,
          parentToolUseId: parentId,
        })
      } else if (block.type === "thinking") {
        out.push({
          type: "thinking",
          content: block.thinking ?? "",
          signature: block.signature ?? undefined,
          parentToolUseId: parentId,
        })
      }
    }
    return out
  }

  // ── User message: either plain typed text or tool_result ──
  if (event.type === "user" && event.message?.content) {
    const out = []
    const content = event.message.content
    if (typeof content === "string") {
      if (!isInternalUserText(content)) {
        out.push({ type: "message", role: "user", content, isDelta: false })
      }
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result") {
          const body = Array.isArray(block.content)
            ? block.content.map((c) => c.text ?? "").join("")
            : typeof block.content === "string"
            ? block.content
            : JSON.stringify(block.content ?? "")
          out.push({
            type: "tool_result",
            id: block.tool_use_id,
            output: body,
            isError: Boolean(block.is_error),
            parentToolUseId: parentId,
          })
        } else if (block.type === "text") {
          const text = block.text ?? ""
          if (text && !isInternalUserText(text)) {
            out.push({ type: "message", role: "user", content: text, isDelta: false })
          }
        }
      }
    }
    return out
  }

  // ── Turn result ────────────────────────────────────────────
  if (event.type === "result") {
    const out = []

    if (event.usage) {
      out.push({
        type: "token_usage",
        input: event.usage.input_tokens ?? 0,
        output: event.usage.output_tokens ?? 0,
        cacheRead: event.usage.cache_read_input_tokens ?? 0,
        cacheWrite: event.usage.cache_creation_input_tokens ?? 0,
      })
    }

    if (Array.isArray(event.permission_denials) && event.permission_denials.length > 0) {
      out.push({
        type: "permission_denied",
        denials: event.permission_denials.map((d) => ({
          toolName: d.tool_name,
          toolUseId: d.tool_use_id,
          input: d.tool_input,
        })),
      })
    }

    if (event.subtype === "error" || event.is_error) {
      out.push({
        type: "error",
        code: "claude_api_error",
        message: event.result ?? event.api_error_status ?? "claude returned error",
      })
    }

    out.push({
      type: "complete",
      exitCode: 0,
      turnStats: {
        durationMs: event.duration_ms,
        durationApiMs: event.duration_api_ms,
        numTurns: event.num_turns,
        totalCostUsd: event.total_cost_usd,
      },
    })
    return out
  }

  return [{ type: "system", subtype: "unknown", raw: event }]
}
