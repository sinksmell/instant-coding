# Codespace devcontainer template

This directory is a **template** — not the devcontainer for the `instant-coding` repo itself. Users copy `devcontainer.json` into **their own repository** so that a Codespace created there automatically installs the `claude` CLI and launches `agent-runtime` on port 3030.

## How it is wired (M5 current)

1. User creates a Codespace on their repo via the Instant Coding UI (`POST /api/codespaces`).
2. Codespace boot executes `postCreateCommand` → installs `@anthropic-ai/claude-code` globally.
3. `postStartCommand` launches `agent-runtime` as a detached process on `127.0.0.1:3030`. It expects the `agent-runtime` package to live at `${workspace}/.claude-runtime/`.
4. `forwardPorts: [3030]` + `visibility: "private"` → the port is only reachable via an authenticated request that carries the user's GitHub token in `X-Github-Token` (this is what `lib/agent/lifecycle.ts` sends).
5. BFF signs a short-lived JWT (HS256, `aud: "instant-coding-runtime"`, 5 min TTL) using `AGENT_RUNTIME_JWT_SECRET` — the same secret must be set on the Codespace side as a GitHub Codespaces user secret so `agent-runtime` can verify it (`remoteEnv` forwards it to the runtime process).

## Known gaps (will close in later milestones)

- **`agent-runtime` is not yet published to npm**. The `postStartCommand` assumes the caller has placed the runtime under `.claude-runtime/`. Once the package ships, the command becomes `agent-runtime --port 3030 --cwd ${containerWorkspaceFolder}`.
- **No systemd unit**. A crash won't respawn — you'd need to `gh codespace ssh -- pm2 start` manually. Acceptable for M5; will harden in M10.
- **Secret provisioning is manual**. Users must set `AGENT_RUNTIME_JWT_SECRET` as a GitHub Codespaces user secret today (Settings → Codespaces → Secrets). Automated injection via `gh api` is a later task.

## Smoke verifying against a real Codespace

```bash
# 1. Ensure your Codespace is Available
gh codespace list

# 2. Exec into the runtime's health endpoint
gh codespace ssh -c <codespace-name> -- curl -s localhost:3030/health

# 3. From your BFF machine, tunnel + wscat
gh codespace ports forward 3030:3030 -c <codespace-name> &
wscat -c ws://localhost:3030/agent \
  -H "Authorization: Bearer $(node -e 'console.log(require("jsonwebtoken").sign({sub:"u1"}, process.env.AGENT_RUNTIME_JWT_SECRET, {audience:"instant-coding-runtime",issuer:"instant-coding-bff",expiresIn:300}))')"
```
