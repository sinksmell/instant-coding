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

Codespace 启动后两个 CLI 都已就位，但还没登录态。两种方式：

**A. Codespace Secrets（推荐，免交互）**

GitHub → `Settings` → `Codespaces` → `Repository secrets`，配：

- `ANTHROPIC_API_KEY` → Claude Code 自动用
- `OPENAI_API_KEY` → Codex CLI 自动用

下次启动 Codespace 自动注入到环境变量。

**B. 命令行登录**

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
