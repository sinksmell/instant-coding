import { query } from "@anthropic-ai/claude-agent-sdk"
import { randomUUID } from "node:crypto"
import { normalize } from "./sdk-normalize.js"

/**
 * SDK-backed Claude session driver. One instance per WS connection; each
 * incoming prompt becomes a fresh `query()` call whose options.resume is set
 * to the captured session id, so the SDK continues the same conversation.
 *
 * Differences vs. a raw child_process:
 *   - Per-turn async generator (end naturally on `result`); we DON'T keep a
 *     long-running child between turns. The SDK still writes to
 *     ~/.claude/projects/*.jsonl so the shell tab can `claude --resume <id>`.
 *   - Streaming text: content_block_delta events become `stream_delta`-style
 *     messages with isDelta:true; client does the typewriter rendering.
 *   - Interactive permissions: the SDK's canUseTool hook fires per tool;
 *     we turn it into a permission_request → permission_decision WS round
 *     trip (55s timeout → auto-deny).
 */

const PERMISSION_TIMEOUT_MS = 55_000

export class ClaudeSession {
  /**
   * @param {object} opts
   * @param {string} opts.cwd
   * @param {string} [opts.sessionId]               resume id from a prior session
   * @param {object} [opts.env]                     merged over process.env for the SDK child
   * @param {string} [opts.permissionMode]          default|acceptEdits|bypassPermissions|plan|dontAsk|auto
   * @param {string[]} [opts.allowedTools]
   * @param {string[]} [opts.disallowedTools]
   * @param {string} [opts.model]                   sonnet|opus|haiku|...
   * @param {(evt: object) => void} opts.onEvent
   * @param {(err: {code:string,message:string}) => void} opts.onError
   * @param {(reason: string) => void} opts.onExit  only fires on stop()
   */
  constructor(opts) {
    this.opts = opts
    this.sessionId = opts.sessionId || null
    /** @type {any} */
    this.currentQuery = null
    this.closed = false
    /** requestId → { resolve, reject, timer } */
    this.pendingPermissions = new Map()
    this.sessionCreatedEmitted = false
    /** at most one queued follow-up prompt */
    this.queuedPrompt = null
  }

  /** Kick off the first turn. Resolves when the turn completes (or errors). */
  async start(initialPrompt) {
    if (this.closed) return
    await this._runTurn(initialPrompt)
  }

  /**
   * Send a follow-up user message. If a turn is still draining, queue one
   * prompt and run it as soon as the current turn finishes. Additional
   * prompts while one is already queued are rejected as turn_in_progress.
   */
  async sendPrompt(promptText) {
    if (this.closed) return
    if (this.currentQuery) {
      if (this.queuedPrompt) {
        this.opts.onEvent({
          type: "error",
          code: "turn_in_progress",
          message: "a previous turn has not finished yet",
        })
        return
      }
      this.queuedPrompt = promptText
      return
    }
    await this._runTurn(promptText)
  }

  /** Resolve a pending permission request from the WS client. */
  resolvePermission(requestId, decision) {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending) return
    this.pendingPermissions.delete(requestId)
    clearTimeout(pending.timer)
    pending.resolve(decision)
  }

  /** Interrupt the current turn. No-op if no turn running. */
  abort() {
    if (!this.currentQuery) return
    try {
      // SDK's Query exposes .interrupt() as of 0.2.100+
      if (typeof this.currentQuery.interrupt === "function") {
        this.currentQuery.interrupt().catch(() => {})
      }
    } catch {
      /* noop */
    }
  }

  /** Terminate the session. Outstanding permission requests get auto-denied. */
  stop() {
    if (this.closed) return
    this.closed = true
    this.abort()
    for (const [, pending] of this.pendingPermissions) {
      clearTimeout(pending.timer)
      pending.resolve({ behavior: "deny", message: "session closed" })
    }
    this.pendingPermissions.clear()
    this.opts.onExit("stopped")
  }

  // ── internals ─────────────────────────────────────────────

  _buildSdkOptions() {
    const sdk = {
      // SDK ≥0.2.113 replaces process.env wholesale, so we forward it.
      env: { ...process.env, ...(this.opts.env || {}) },
      pathToClaudeCodeExecutable: process.env.CLAUDE_CLI_PATH || "claude",
      cwd: this.opts.cwd,
      systemPrompt: { type: "preset", preset: "claude_code" },
      settingSources: ["project", "user", "local"],
      tools: { type: "preset", preset: "claude_code" },
      canUseTool: (toolName, input) => this._handleToolPermission(toolName, input),
    }

    if (this.sessionId) sdk.resume = this.sessionId
    if (this.opts.permissionMode && this.opts.permissionMode !== "default") {
      sdk.permissionMode = this.opts.permissionMode
    }
    if (this.opts.allowedTools?.length) sdk.allowedTools = [...this.opts.allowedTools]
    if (this.opts.disallowedTools?.length) sdk.disallowedTools = [...this.opts.disallowedTools]
    if (this.opts.model) sdk.model = this.opts.model

    return sdk
  }

  async _handleToolPermission(toolName, input) {
    if (this.closed) return { behavior: "deny", message: "session closed" }

    const requestId = `perm_${randomUUID().slice(0, 8)}`
    this.opts.onEvent({
      type: "permission_request",
      requestId,
      toolName,
      input,
    })

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingPermissions.delete(requestId)) {
          resolve({ behavior: "deny", message: "timed out waiting for user approval" })
        }
      }, PERMISSION_TIMEOUT_MS)
      this.pendingPermissions.set(requestId, {
        resolve: (decision) => {
          clearTimeout(timer)
          resolve(decision)
        },
        timer,
      })
    })
  }

  async _runTurn(promptText) {
    const options = this._buildSdkOptions()
    let queryInstance
    try {
      queryInstance = query({ prompt: promptText, options })
    } catch (err) {
      this.opts.onError({
        code: "claude_init_failed",
        message: err instanceof Error ? err.message : String(err),
      })
      return
    }
    this.currentQuery = queryInstance

    try {
      for await (const msg of queryInstance) {
        if (this.closed) break

        // Capture & dedupe session_created across turns: SDK may emit init
        // per query; we only want the first one to surface to the client.
        const sid = msg?.session_id
        if (sid && !this.sessionId) this.sessionId = sid
        if (sid && !this.sessionCreatedEmitted) {
          this.sessionCreatedEmitted = true
          this.opts.onEvent({ type: "session_created", sessionId: sid })
        }

        for (const out of normalize(msg)) {
          this.opts.onEvent(out)
        }
      }
    } catch (err) {
      // Treat thrown errors (network, auth, etc.) as WS-level error events.
      this.opts.onError({
        code: "claude_api_error",
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this.currentQuery = null
      // Drain a queued follow-up prompt, if any.
      if (!this.closed && this.queuedPrompt !== null) {
        const next = this.queuedPrompt
        this.queuedPrompt = null
        // Run on next tick so caller observes the clear first.
        queueMicrotask(() => {
          this._runTurn(next).catch(() => {})
        })
      }
    }
  }
}
