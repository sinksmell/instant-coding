# @instant-coding/agent-runtime

A thin WebSocket bridge between the Instant Coding BFF and the native `claude` CLI running inside a user's Codespace. Implements M4 of [../../ROADMAP.md](../../ROADMAP.md); protocol defined in [../../ARCHITECTURE.md](../../ARCHITECTURE.md#五ws-协议规格).

Currently PoC. Lives in the main repo under `apps/agent-runtime/`; will be extracted to its own repo once stable.

## Responsibilities

- Spawn `claude -p --output-format stream-json --input-format stream-json --verbose` per WS connection
- Pipe WS `prompt` / `abort` messages ↔ child stdin / SIGINT
- Parse child stdout NDJSON → normalize to the WS events in ARCHITECTURE §5.3.2
- (Reserved, not yet implemented) `/shell` (M8), `/git` (M7), `/fs` (M9)

## Prerequisites

- Node 20+
- `claude` CLI on `PATH` (`npm i -g @anthropic-ai/claude-code`)
- `ANTHROPIC_API_KEY` available either in the process env or passed per-connection via `X-Anthropic-Api-Key` WS handshake header
- C++ toolchain for building `node-pty` on install (`python3`, `make`, `g++` / Xcode Command Line Tools on macOS). If `npm i` leaves you without `node_modules/node-pty/build/Release/pty.node`, run `npm rebuild node-pty` — node-pty's prebuild fetch silently falls back to an unbuilt state in some environments.

## Run

```bash
cd apps/agent-runtime
npm install
npm start -- --port 3030 --cwd /path/to/repo
```

Dev with auto-reload:
```bash
npm run dev
```

## Smoke tests

```bash
cd apps/agent-runtime

# /agent WS — real claude call; billed
ANTHROPIC_API_KEY=sk-... npm run smoke

# /git REST — offline; creates a throwaway repo in $TMPDIR
npm run smoke:git

# /shell WS — offline; spawns a pty, echoes a marker, exits
npm run smoke:shell

# /fs REST — offline; tree + read + write + binary detect + sandbox
npm run smoke:fs
```

## WS protocol

See [ARCHITECTURE §5.3](../../ARCHITECTURE.md#53-消息-schema).

Connect: `ws://<host>:<port>/agent` with headers:
- `Authorization: Bearer <jwt>` (only when `AGENT_RUNTIME_JWT_SECRET` is set; unset in dev)
- `X-Anthropic-Api-Key: <key>` (optional; injected into child env)
- `X-Anthropic-Base-Url: <url>` (optional)

Client → server:
```json
{ "type": "prompt", "content": "...", "sessionId": "<optional-resume>" }
{ "type": "abort" }
{ "type": "permission_decision", "requestId": "...", "allow": true }
```

Server → client: `session_created`, `message`, `tool_call`, `tool_result`, `token_usage`, `complete`, `error`, plus passthrough `system` events for diagnostics.

## Auth

JWT verification is off by default. Set `AGENT_RUNTIME_JWT_SECRET=<hex>` to require `Authorization: Bearer <HS256 JWT>` with `aud: "instant-coding-runtime"`.

## CLI flags

```
agent-runtime [--port 3030] [--host 127.0.0.1] [--cwd <path>]
```
