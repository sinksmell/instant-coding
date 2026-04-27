import { spawn } from "node:child_process";
import { LineSplitter, normalize } from "./stream-json.js";

const CLAUDE_BIN = process.env.CLAUDE_CLI_PATH || "claude";

/**
 * Spawn a `claude -p --output-format stream-json --input-format stream-json --verbose`
 * process for a single WS session. One proc per session.
 */
export class ClaudeSession {
  /**
   * @param {object} opts
   * @param {string} opts.cwd
   * @param {string} [opts.sessionId]           optional: resume by session id
   * @param {object} [opts.env]                 extra env merged over process.env
   * @param {(evt: object) => void} opts.onEvent  normalized WS event callback
   * @param {(err: Error) => void} opts.onError
   * @param {(code: number|null) => void} opts.onExit
   */
  constructor(opts) {
    this.opts = opts;
    this.splitter = new LineSplitter();
    this.proc = null;
    this.closed = false;
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
    if (this.opts.sessionId) {
      args.push("--resume", this.opts.sessionId);
    }

    const env = { ...process.env, ...(this.opts.env || {}) };

    this.proc = spawn(CLAUDE_BIN, args, {
      cwd: this.opts.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");

    this.proc.stdout.on("data", (chunk) => this._handleStdout(chunk));
    this.proc.stderr.on("data", (chunk) => this._handleStderr(chunk));
    this.proc.on("error", (err) => this.opts.onError(err));
    this.proc.on("close", (code) => {
      if (this.closed) return;
      this.closed = true;
      for (const line of this.splitter.flush()) this._handleLine(line);
      this.opts.onExit(code);
    });

    if (initialPrompt) this.sendPrompt(initialPrompt);
  }

  /**
   * Send a user prompt via stdin. Claude's stream-json input schema expects:
   *   { type: "user", message: { role: "user", content: "<text>" } }
   */
  sendPrompt(content) {
    if (!this.proc || this.closed) return;
    const msg = {
      type: "user",
      message: { role: "user", content },
    };
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  abort() {
    if (!this.proc || this.closed) return;
    try {
      this.proc.kill("SIGINT");
    } catch {}
  }

  stop() {
    if (!this.proc || this.closed) return;
    this.closed = true;
    try {
      this.proc.stdin.end();
      this.proc.kill("SIGTERM");
    } catch {}
  }

  _handleStdout(chunk) {
    for (const line of this.splitter.push(chunk)) this._handleLine(line);
  }

  _handleLine(line) {
    let event;
    try {
      event = JSON.parse(line);
    } catch (err) {
      this.opts.onEvent({ type: "system", subtype: "parse_error", raw: line });
      return;
    }
    for (const out of normalize(event)) this.opts.onEvent(out);
  }

  _handleStderr(chunk) {
    // claude's stderr is usually harmless noise; surface as system events for debugging
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      this.opts.onEvent({ type: "system", subtype: "stderr", raw: line });
    }
  }
}
