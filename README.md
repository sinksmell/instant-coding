# Instant Coding — Codespace 启动器

一键拉起一个**预装好 Claude Code、Codex CLI、Node/pnpm、Python、Go** 的 GitHub Codespace，浏览器打开就能直接开 vibe-coding。

## 一键启动

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/sinksmell/instant-coding)

或者：在 GitHub 仓库主页点 `Code` → `Codespaces` → `Create codespace on master`。
本地用 VS Code 也行：`Dev Containers: Clone Repository in Container Volume...`。

## 装了什么

| 工具 | 版本 | 来源 |
| --- | --- | --- |
| Node.js | 22 (LTS) | devcontainer feature |
| pnpm | 9 | corepack |
| Python | 3.12 | devcontainer feature |
| uv / pipx | latest | post-create |
| Go | 1.23 | devcontainer feature |
| GitHub CLI (`gh`) | latest | devcontainer feature |
| Claude Code (`claude`) | latest | `npm i -g @anthropic-ai/claude-code` |
| Codex CLI (`codex`) | latest | `npm i -g @openai/codex` |

VS Code 端预装：Claude Code、Python、Pylance、Go、ESLint、Prettier、GitLens。

## 配置 API Key

Codespace 启动后两个 CLI 都已就位，但还没登录态。三种方式，按需挑一种：

**A. 官方账号 + Codespace Secrets（推荐，免交互）**

GitHub → `Settings` → `Codespaces` → `Repository secrets`（或 `User secrets` 跨仓库共享），配：

- `ANTHROPIC_API_KEY` → Claude Code 自动用
- `OPENAI_API_KEY` → Codex CLI 自动用

下次启动 Codespace 自动注入到环境变量。`.devcontainer/devcontainer.json` 的 `remoteEnv` 负责把它们透传进容器。

**B. 第三方 Anthropic 兼容网关（比如 DeepSeek / 自建中转）**

同样走 Codespace Secrets，但换一组变量。Claude Code 看到 `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` 就会走那个地址而不是 `api.anthropic.com`，模型名则映射到目标提供商。以 DeepSeek 为例：

```bash
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=<你的 DeepSeek API Key>
ANTHROPIC_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash
CLAUDE_CODE_EFFORT_LEVEL=max
```

这 8 个变量名都已在 `devcontainer.json` 的 `remoteEnv` 里声明了，只要在 Codespace Secrets 里配好同名 key，进容器就能用。完整清单见 `.env.example`。

**C. 命令行登录**

```bash
claude login    # OAuth 走浏览器
codex login     # OpenAI 账号登录
```

## 自检

进 Codespace 后 `post-create.sh` 会自动跑，末尾打印一份工具版本清单。手动重跑：

```bash
bash .devcontainer/post-create.sh
```

## 自定义

- 改语言版本：编辑 `.devcontainer/devcontainer.json` 里 features 字段的 `version`
- 加全局工具：往 `.devcontainer/post-create.sh` 里塞 `npm i -g` / `pipx install` / `go install`
- 加 VS Code 扩展：在 `customizations.vscode.extensions` 列表里加 ID
- 转发更多端口：`forwardPorts` 数组里加端口号

## 目录

```
.devcontainer/
  devcontainer.json    # Codespace 主配置
  post-create.sh       # 第一次启动时跑的初始化脚本
.env.example           # 需要在 Codespace secrets 里配的环境变量清单
```
