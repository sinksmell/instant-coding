/**
 * Parse NDJSON lines coming from `claude -p --output-format stream-json --verbose`
 * and normalize them into the WS protocol documented in ARCHITECTURE §5.3.
 *
 * Claude stream-json schema (observed on claude 2.1.x):
 *   { type: "system", subtype: "init", session_id, cwd, tools, ... }
 *   { type: "system", subtype: "hook_started" | "hook_response" | ... }
 *   { type: "assistant", message: { content: [{type:"text"|"tool_use", ...}], usage, ... }, session_id }
 *   { type: "user", message: { content: [{type:"tool_result", tool_use_id, content, is_error?}] }, session_id }
 *   { type: "result", subtype: "success"|"error", result, usage, total_cost_usd, session_id }
 */

export class LineSplitter {
  constructor() {
    this.buf = "";
  }
  push(chunk) {
    this.buf += chunk;
    const lines = [];
    let idx;
    while ((idx = this.buf.indexOf("\n")) !== -1) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (line.length > 0) lines.push(line);
    }
    return lines;
  }
  flush() {
    const rest = this.buf.trim();
    this.buf = "";
    return rest.length > 0 ? [rest] : [];
  }
}

/**
 * Convert one stream-json event into zero or more WS events (matches ARCHITECTURE §5.3.2).
 * Returns an array of { type, ... } objects.
 */
export function normalize(event) {
  if (!event || typeof event !== "object") return [];

  if (event.type === "system" && event.subtype === "init") {
    return [{ type: "session_created", sessionId: event.session_id }];
  }

  if (event.type === "system") {
    // hook_started / hook_response / other — forward as raw for transparency
    return [{ type: "system", subtype: event.subtype, raw: event }];
  }

  if (event.type === "assistant" && event.message?.content) {
    const out = [];
    for (const block of event.message.content) {
      if (block.type === "text") {
        out.push({
          type: "message",
          role: "assistant",
          content: block.text,
          isDelta: false,
        });
      } else if (block.type === "tool_use") {
        out.push({
          type: "tool_call",
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }
    if (event.message.usage) {
      out.push({
        type: "token_usage",
        input: event.message.usage.input_tokens ?? 0,
        output: event.message.usage.output_tokens ?? 0,
        cacheRead: event.message.usage.cache_read_input_tokens ?? 0,
        cacheWrite: event.message.usage.cache_creation_input_tokens ?? 0,
      });
    }
    return out;
  }

  if (event.type === "user" && event.message?.content) {
    const out = [];
    for (const block of event.message.content) {
      if (block.type === "tool_result") {
        const content = Array.isArray(block.content)
          ? block.content.map((c) => c.text ?? "").join("")
          : typeof block.content === "string"
          ? block.content
          : JSON.stringify(block.content ?? "");
        out.push({
          type: "tool_result",
          id: block.tool_use_id,
          output: content,
          isError: Boolean(block.is_error),
        });
      }
    }
    return out;
  }

  if (event.type === "result") {
    const out = [];
    if (event.usage) {
      out.push({
        type: "token_usage",
        input: event.usage.input_tokens ?? 0,
        output: event.usage.output_tokens ?? 0,
        cacheRead: event.usage.cache_read_input_tokens ?? 0,
        cacheWrite: event.usage.cache_creation_input_tokens ?? 0,
      });
    }
    if (event.subtype === "error" || event.is_error) {
      out.push({
        type: "error",
        code: "claude_api_error",
        message: event.result ?? event.api_error_status ?? "claude returned error",
      });
    }
    out.push({ type: "complete", exitCode: 0 });
    return out;
  }

  return [{ type: "system", subtype: "unknown", raw: event }];
}
