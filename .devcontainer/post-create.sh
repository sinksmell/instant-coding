#!/usr/bin/env bash
set -euo pipefail

echo "==> Enabling corepack & activating pnpm@9"
corepack enable
corepack prepare pnpm@9 --activate

echo "==> Installing Claude Code CLI (@anthropic-ai/claude-code)"
npm install -g @anthropic-ai/claude-code

echo "==> Installing Codex CLI (@openai/codex)"
npm install -g @openai/codex

echo "==> Python tooling (pipx + uv)"
python3 -m pip install --user --upgrade pip pipx >/dev/null
python3 -m pipx ensurepath >/dev/null || true
python3 -m pipx install uv >/dev/null || true

echo "==> Go toolchain sanity"
go env GOPATH GOROOT >/dev/null

cat <<BANNER

==================== tool versions ====================
node      : $(node --version 2>/dev/null || echo missing)
pnpm      : $(pnpm --version 2>/dev/null || echo missing)
python3   : $(python3 --version 2>/dev/null || echo missing)
go        : $(go version 2>/dev/null || echo missing)
claude    : $(claude --version 2>/dev/null || echo 'missing — run: npm i -g @anthropic-ai/claude-code')
codex     : $(codex --version 2>/dev/null || echo 'missing — run: npm i -g @openai/codex')
gh        : $(gh --version 2>/dev/null | head -n1 || echo missing)
=======================================================

Next steps:
  1. Set Codespace secrets (Settings -> Codespaces):
       ANTHROPIC_API_KEY   for Claude Code
       OPENAI_API_KEY      for Codex CLI
     or run 'claude login' / 'codex login' interactively.
  2. Start coding: 'claude' or 'codex'.

BANNER
