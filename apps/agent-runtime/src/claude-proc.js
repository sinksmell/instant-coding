import { spawn } from "node:child_process";
import { LineSplitter, normalize } from "./stream-json.js";

const CLAUDE_BIN = process.env.CLAUDE_CLI_PATH || "claude";
const ABORT_GRACE_MS = 5000;

/**
 * One `claude -p --output-format stream-json --input-format stream-json --verbose`
 * process per WS session. Stays alive across turns — subsequent prompts are piped
 * into stdin without re-spawning.
 */
export class ClaudeSession {
  /**
   * @param {object} opts
   * @param {string} opts.cwd
   * @param {string} [opts.sessionId]
   * @param {object} [opts.env]                   extra env merged over process.env
   * @param {"default"|"acceptEdits"|"bypassPermissions"|"plan"|"dontAsk"|"auto"} [opts.permissionMode]
   * @param {string[]} [opts.allowedTools]
   * @param {string[]} [opts.disallowedTools]
   * @param {(evt: object) => void} opts.onEvent  normalized WS event callback
   * @param {(err: {code: string, message: string}) => void} opts.onError
   * @param {(code: number|null, signal: string|null) => void} opts.onExit
   */
  constructor(opts) {
    this.opts = opts;
    this.splitter = new LineSplitter();
    this.proc = null;
    this.closed = false;
    this.abortTimer = null;
  }

  start(initialPrompt) {
    if (this.proc) return;

    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--verbose",
    ];
    if (this.opts.sessionId) args.push("--resume", this.opts.sessionId);
    if (this.opts.permissionMode) args.push("--permission-mode", this.opts.permissionMode);
    if (this.opts.allowedTools?.length) args.push("--allowedTools", ...this.opts.allowedTools);
    if (this.opts.disallowedTools?.length)
      args.push("--disallowedTools", ...this.opts.disallowedTools);

    const env = { ...process.env, ...(this.opts.env || {}) };

    try {
      this.proc = spawn(CLAUDE_BIN, args, {
        cwd: this.opts.cwd,
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      this.opts.onError(this._classifyError(err));
      this.closed = true;
      return;
    }

    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");

    this.proc.stdout.on("data", (chunk) => this._handleStdout(chunk));
    this.proc.stderr.on("data", (chunk) => this._handleStderr(chunk));
    this.proc.on("error", (err) => this.opts.onError(this._classifyError(err)));
    this.proc.on("close", (code, signal) => this._handleClose(code, signal));

    if (initialPrompt) this.sendPrompt(initialPrompt);
  }

  /**
   * Send a user prompt via stdin. Claude stream-json input schema:
   *   { type: "user", message: { role: "user", content: "<text>" } }
   */
  sendPrompt(content) {
    if (!this.proc || this.closed) return;
    const msg = { type: "user", message: { role: "user", content } };
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  /** Signal the current turn to stop. SIGINT → 5s grace → SIGTERM. */
  abort() {
    if (!this.proc || this.closed) return;
    try {
      this.proc.kill("SIGINT");
    } catch {}
    if (this.abortTimer) return;
    this.abortTimer = setTimeout(() => {
      if (!this.closed && this.proc) {
        try {
          this.proc.kill("SIGTERM");
        } catch {}
      }
    }, ABORT_GRACE_MS);
    this.abortTimer.unref?.();
  }

  /** End the session; forceful if the child does not exit in time. */
  stop() {
    if (!this.proc || this.closed) return;
    try {
      this.proc.stdin.end();
    } catch {}
    this.abort();
  }

  _handleStdout(chunk) {
    for (const line of this.splitter.push(chunk)) this._handleLine(line);
  }

  _handleLine(line) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      this.opts.onEvent({ type: "system", subtype: "parse_error", raw: line });
      return;
    }
    for (const out of normalize(event)) this.opts.onEvent(out);
  }

  _handleStderr(chunk) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      this.opts.onEvent({ type: "system", subtype: "stderr", raw: line });
    }
  }

  _handleClose(code, signal) {
    if (this.closed) return;
    this.closed = true;
    if (this.abortTimer) {
      clearTimeout(this.abortTimer);
      this.abortTimer = null;
    }
    for (const line of this.splitter.flush()) this._handleLine(line);
    this.opts.onExit(code, signal);
  }

  _classifyError(err) {
    if (err && err.code === "ENOENT") {
      return {
        code: "claude_not_installed",
        message: `claude binary not found in PATH (looked for "${CLAUDE_BIN}"). Install it with: npm i -g @anthropic-ai/claude-code`,
      };
    }
    if (err && err.code === "EACCES") {
      return { code: "claude_not_installed", message: `claude binary not executable: ${err.message}` };
    }
    return { code: "runtime_unreachable", message: err?.message || String(err) };
  }
}
