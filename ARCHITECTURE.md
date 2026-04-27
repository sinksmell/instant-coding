# Instant Coding 技术方案

> 更新于 2026-04-27
> 配套文档：[ROADMAP.md](./ROADMAP.md)
> 参考实现：[siteboon/claudecodeui](https://github.com/siteboon/claudecodeui)

## 一、总体架构

Instant Coding 是 B-S 三段式架构：浏览器 ⟷ Next.js BFF ⟷ Codespace 内常驻 agent-runtime。核心原则是**把 Claude Code 进程放进每个用户的 Codespace**，Next.js 退化为 WS 反向代理 + 生命周期管家。

```
┌─────────────┐    wss         ┌─────────────────┐   wss/https    ┌────────────────────────────────┐
│  Browser    │ ◄────────────► │  Next.js (BFF)  │ ◄────────────► │  Codespace (per repo)         │
│  React UI   │                │  auth / proxy / │                │  ┌──────────────────────────┐ │
│  xterm.js   │                │  lifecycle /    │                │  │ agent-runtime (薄)        │ │
│  Monaco     │                │  task registry  │                │  │ WS ⟷ stdio 桥 + PTY     │ │
└─────────────┘                └─────────────────┘                │  └────┬───────────┬─────────┘ │
                                      │                           │       │           │            │
                                      ▼                           │       ▼           ▼            │
                               ┌──────────────┐                   │  ┌────────┐  ┌──────────┐    │
                               │  Supabase    │                   │  │ claude │  │ bash +   │    │
                               │  metadata    │                   │  │ CLI    │  │ node-pty │    │
                               └──────────────┘                   │  │(stream-│  │(xterm)   │    │
                                                                   │  │ json)  │  │          │    │
                                                                   │  └────────┘  └──────────┘    │
                                                                   │       └─ 共享 ~/.claude/ ─┘   │
                                                                   └────────────────────────────────┘
```

**三层职责**：

1. **Browser**：纯展示 + 交互。WS 直连 BFF。组件：聊天面板（`agent-chat.tsx`）、diff 查看器（Monaco）、终端（xterm.js）、文件树、git 面板。
2. **Next.js BFF**：不跑任何 AI、不跑 PTY。职责：
   - NextAuth + GitHub OAuth（已有）
   - Codespace 生命周期（boot / stop / create / destroy，复用 `lib/github/codespaces.ts`）
   - WS 反向代理（`/api/agent/ws`）：鉴权 → 查 DB → boot Codespace → 签 JWT → 反向代理到 Codespace 私有端口
   - Supabase 元数据管理（任务 / 会话外键 / token 用量）
3. **Codespace agent-runtime**（薄桥接，独立 repo `@instant-coding/agent-runtime`）：核心只做协议转换。
   - `/agent` WS：`spawn('claude', [...])` 进程桥，stdin ⟷ WS 输入，stream-json stdout ⟷ WS 事件
   - `/shell` WS：`node-pty` spawn 用户 `$SHELL`，随连接生命周期，client ⟷ pty stdio；支持 `{type:"resize"}` SIGWINCH
   - `/git/*` REST：`status`/`diff`/`file`/`worktree`/`commit`/`push`（M7，见 §5.5）
   - `/fs` REST：`tree` / `read` / `write`（见 §5.7）
   - Session 持久化**完全依赖** `~/.claude/projects/*.jsonl`（Claude Code 自维护），**不建消息表**

## 二、为什么这个架构

### 2.1 为什么把 agent 放进 Codespace

| 维度 | Next.js 内跑 Agent | Codespace 内跑 Claude Code |
|---|---|---|
| 多租户隔离 | 共享进程，需自己隔离 | 每用户独立 VM，GitHub 原生隔离 |
| Shell / 文件系统 | 要自己实现或走 SSH 桥 | 就是本机 fs，零成本 |
| Session 持久化 | 自己写表存 | Claude Code 自带 `.jsonl` |
| Git credential | 要拿 user token 当代理 | Codespace 已登录 GitHub |
| 成本归属 | 我们服务器扛 | 用户 Codespace 额度 |
| 离线/断线恢复 | 麻烦 | `claude --resume <id>` 即可 |
| 扩展 MCP | 要自己注册 | 写 `~/.claude.json` 就行 |

代价：Codespace 冷启动（~30s～2min），需要 agent-runtime 的 bootstrap 机制（见第七节）。

### 2.2 为什么直接用 `claude` CLI、不用 `@anthropic-ai/claude-agent-sdk`

调研 claudecodeui 的实现（`server/claude-sdk.js:160` 写死 `sdkOptions.pathToClaudeCodeExecutable = process.env.CLAUDE_CLI_PATH || 'claude'`），确认 **SDK 底层就是 spawn 同一个 `claude` 二进制**，它只在上面包了 stream-json 的程序化 API。

| 维度 | 用 SDK | 直接用 CLI |
|---|---|---|
| 依赖 | 绑 SDK 版本，SDK 升级可能破坏兼容 | 只依赖 Codespace 里 `claude` 可执行 |
| 版本/配置一致性 | SDK 自带一套，可能与用户的 `claude` 不同 | 跟用户手动跑的 `claude` 100% 一致 |
| 人机 session 共享 | 做不到 | **shell tab 与 chat tab 共读同一个 `~/.claude/projects/*.jsonl`** |
| MCP / hook / subagent | 要看 SDK 是否暴露 | Claude Code 新能力**自动**可用 |
| abort / permission | SDK 有现成 API（省事） | 解析 stream-json 自己实现（约几百行） |

结论：agent-runtime 的 `/agent` 路径直接 `spawn('claude', ...)` + 自己解析 stream-json。SDK 节省的代码量，远不及"人机 session 共享"和"版本解耦"带来的架构收益。

### 2.3 为什么还需要 agent-runtime（不直接让 BFF SSH 进去跑）

考虑过让 Next.js BFF 直接 `gh codespace ssh -- claude -p ... --output-format stream-json` 转发 stdio，不在 Codespace 部署任何服务。结论**不可行**：

- 每次 SSH 握手 200-500ms，多会话、频繁消息时延不可接受
- PTY 场景要 `ssh -t`，断线恢复、多路复用不友好
- 进程生命周期绑在 SSH 连接上，BFF 重启/网络抖动就 kill Claude 会话
- 文件读写、git、watcher 要各套一层 SSH

所以 Codespace 里要有一个常驻进程，但它职责极薄：**WS ⟷ `claude` CLI stdio 桥 + PTY + 少量 REST**。

## 三、技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14 + React 18 + Tailwind + **xterm.js** + **Monaco / @monaco-editor/react** |
| BFF | Next.js App Router + 自定义 `server.js`（WS 升级）+ `ws` + `jsonwebtoken` |
| Agent Runtime | Node 20 + Express + `ws` + `node-pty` + `child_process.spawn('claude', ...)` + `chokidar`；**不依赖** `@anthropic-ai/claude-agent-sdk` |
| Claude Code CLI | Codespace 里 `npm i -g @anthropic-ai/claude-code`，作为独立可执行文件 |
| 认证 | NextAuth 5（GitHub OAuth）+ 内部短期 JWT（BFF ↔ Codespace） |
| 数据库 | Supabase（Postgres） |
| 基础设施 | GitHub Codespaces + 私有端口转发（GitHub Token 鉴权） |

Agent runtime 打包发布：独立 GitHub repo，npm 包 `@instant-coding/agent-runtime`，通过 devcontainer 的 `postCreateCommand` 安装。

## 四、组件规格

### 4.1 Next.js BFF

**新增入口**：`server.js`（替换现有 `server.js`，不用纯 App Router 因为要处理 WS 升级）或 `app/api/agent/ws/route.ts`（Next 14 实验性 WS 支持）。先走 `server.js` 路线稳。

**核心模块**：
- `lib/agent/proxy.ts`（新）：WS 反向代理主逻辑
- `lib/agent/lifecycle.ts`（新）：Codespace 状态机，复用 `lib/github/codespaces.ts` 的现有函数（`listCodespaces` / `createCodespace` / `startCodespace` / `stopCodespace`）
- `lib/agent/jwt.ts`（新）：JWT 签发，HS256，密钥 `AGENT_RUNTIME_JWT_SECRET`（新环境变量）

**`/api/agent/ws` 代理逻辑**（伪码）：

```
on upgrade(req):
  session = await getServerSession(req)
  if !session: 401
  taskId = parseQuery(req, "taskId")
  task = await supabase.tasks.findById(taskId)
  if task.user_id != session.user.id: 403

  cs = await lifecycle.ensureRunning(task.codespace_id)   # boot if stopped, poll to Available
  if !cs: 503 "codespace_boot_failed"

  jwt = signJWT({ sub: session.user.id, aud: "instant-coding-runtime", exp: now + 300 })
  apiKey = decrypt(user.anthropic_api_key_encrypted)
  baseUrl = user.anthropic_base_url

  upstream = new WebSocket(`wss://${cs.port_forward_url}/agent`, {
    headers: {
      "Authorization": `Bearer ${jwt}`,
      "X-Anthropic-Api-Key": apiKey,
      "X-Anthropic-Base-Url": baseUrl ?? "",
    }
  })

  pipe client <-> upstream  # 纯代理，BFF 不解析消息内容
```

**Codespace 生命周期状态机**：

```
Shutdown ──start()──> Starting ──poll(Available)──> Available ──idle > N min──> Stopped
                          │
                          └─(timeout/fail)──> Failed  （发错误给前端）
```

### 4.2 agent-runtime（独立 repo）

**目录结构**：
```
agent-runtime/
├── package.json              # name: "@instant-coding/agent-runtime"
├── bin/agent-runtime.js      # 可执行入口
├── src/
│   ├── server.ts             # Express + ws setup, JWT middleware
│   ├── agent-ws.ts           # /agent WS：spawn claude + stream-json 桥
│   ├── shell-ws.ts           # /shell WS：node-pty bash
│   ├── fs-routes.ts          # /fs REST
│   ├── git-routes.ts         # /git REST
│   ├── stream-json.ts        # stream-json line parser + 事件归一化
│   └── claude-proc.ts        # spawn/abort/resume 封装
└── README.md
```

**启动**：`agent-runtime --port 3030 --cwd /workspaces/<repo>`。绑 `127.0.0.1:3030`（**不**绑 `0.0.0.0`，靠 Codespace 端口转发暴露）。

**健康检查**：`GET /health` → `{ status: "ok", claudeVersion: "x.y.z", runtimeVersion: "a.b.c" }`。CLI 版本通过 `claude --version` 拿。

**JWT 校验中间件**：所有 WS/REST 路径校验 `Authorization: Bearer <jwt>`，要求 `aud === "instant-coding-runtime"` 且 `exp > now`。

### 4.3 Claude CLI 调用约定

**命令行模板**（`src/claude-proc.ts`）：
```bash
claude \
  -p "<user prompt>" \
  --output-format stream-json \
  --input-format stream-json \
  --verbose \
  [--resume <session-id>]
```

**stdin / stdout**：
- stdin：agent-runtime 把 WS 收到的后续消息按 stream-json 格式写入（一行一个 JSON）
- stdout：按行 parse JSON，归一化后通过 WS 推给 BFF

**进程生命周期**：
- 每个 WS 连接对应一个 `claude` 子进程（首次 prompt 时 spawn）
- 后续 prompt 复用同一进程（通过 stdin 追加）
- `abort` 消息 → 发 `SIGINT` 给子进程；子进程退出后下一次 prompt 重新 spawn + `--resume`
- WS 断开 → `SIGTERM` 子进程，清理资源

**环境变量注入**（子进程 env）：
- `ANTHROPIC_API_KEY`（从 WS 握手头取）
- `ANTHROPIC_BASE_URL`（可选，从 WS 握手头取）
- 继承父进程所有 env（含 `PATH`，保证 `claude` 可执行）

## 五、WS 协议规格

### 5.1 浏览器 ⟷ BFF

- URL：`wss://<your-domain>/api/agent/ws?taskId=<uuid>`
- 鉴权：NextAuth session cookie（自动携带）
- 子协议：无

### 5.2 BFF ⟷ agent-runtime

- URL：`wss://<codespace-port-forward-host>/agent`
- 鉴权：`Authorization: Bearer <short-jwt>`
- 额外头：`X-Anthropic-Api-Key`、`X-Anthropic-Base-Url`（agent-runtime 握手时读取、设为子进程 env、**不回写日志**）
- 子协议：无

### 5.3 消息 schema

BFF 是**透明代理**，浏览器 ⟷ BFF 与 BFF ⟷ runtime 走同一套 schema。消息都是 JSON，一条一个 WS frame。

#### 5.3.1 client → server

| type | 字段 | 说明 |
|---|---|---|
| `prompt` | `content: string`, `sessionId?: string`, `images?: string[]`, `permissionMode?: "default"\|"acceptEdits"\|"bypassPermissions"\|"plan"\|"dontAsk"\|"auto"`, `allowedTools?: string[]`, `disallowedTools?: string[]` | 提交用户输入。首次无 `sessionId`，后续带 runtime 返回的 `sessionId`。`images` 是 base64 data URL。**`permissionMode` / `allowedTools` / `disallowedTools` 只在首条 prompt（spawn 时）生效**，后续 prompt 忽略；要变更需重开 WS 连接。|
| `abort` | — | 中断当前 `claude` 进程（SIGINT，5s 后 SIGTERM 兜底） |

> **headless 模式不支持交互式权限往返**。claude `-p` 不发 `permission_request`；被策略拒的工具直接以 `tool_result` + `is_error:true` 返回，并在 `result.permission_denials[]` 汇总。工具白/黑名单在会话启动时用 `permissionMode` / `allowedTools` / `disallowedTools` 预设。

#### 5.3.2 server → client

| type | 字段 | 说明 |
|---|---|---|
| `session_created` | `sessionId: string` | Claude 分配的 session ID，每个 WS 连接只发 1 次（runtime 去重 claude 的每-turn `system/init`） |
| `message` | `role: "assistant"`, `content: string`, `isDelta: boolean`, `parentToolUseId?: string` | 助手文本；`parentToolUseId` 表示隶属于某个 subagent（Task 工具）的调用树 |
| `thinking` | `content: string`, `signature?: string`, `parentToolUseId?: string` | extended thinking 内容块 |
| `tool_call` | `id: string`, `name: string`, `input: object`, `parentToolUseId?: string` | Claude 调用工具 |
| `tool_result` | `id: string`, `output: string`, `isError: boolean`, `parentToolUseId?: string` | 工具执行结果（runtime 转发 claude stdout 对应段） |
| `permission_denied` | `denials: Array<{toolName, toolUseId, input}>` | 当前 turn 内被 permission-mode 阻塞的工具汇总（从 `result.permission_denials` 归一化） |
| `token_usage` | `input: number`, `output: number`, `cacheRead: number`, `cacheWrite: number` | turn 级累计 token 统计（取自 `result.usage`；不再从 `assistant.usage` 重复发） |
| `complete` | `exitCode: number`, `turnStats: {durationMs, durationApiMs, numTurns, totalCostUsd}` | 当前 turn 结束；进程保持运行，可继续发 `prompt` 开始新 turn |
| `session_ended` | `reason: "normal"\|"user_abort"\|"aborted"` | claude 进程退出，WS 即将关闭 |
| `error` | `code: string`, `message: string` | 见 5.4 错误码表 |
| `system` | `subtype: string`, `raw: object` | 透传 claude 的 `system/*` 事件（hook 生命周期、stderr、parse_error 等）用于诊断 |

示例（`session_created`）：
```json
{ "type": "session_created", "sessionId": "sess_1698765432_abc" }
```

示例（`tool_call` + `tool_result` 对）：
```json
{ "type": "tool_call", "id": "call_01", "name": "Read", "input": { "path": "/workspaces/foo/src/utils.ts" } }
{ "type": "tool_result", "id": "call_01", "output": "export function x() { ... }", "isError": false }
```

字段命名参照 claudecodeui 的 `server/claude-sdk.js` 中 `createNormalizedMessage` 的约定，便于未来复用其前端组件或切换 SDK 驱动而不改协议。

### 5.4 错误码表

| code | 发生位置 | 用户可见话术建议 |
|---|---|---|
| `codespace_boot_failed` | BFF | "环境启动失败，请重试或检查 Codespace 配额" |
| `runtime_unreachable` | BFF / runtime | "Codespace 里的 Agent 服务未就绪" |
| `claude_not_installed` | runtime | "Codespace 里未安装 Claude Code CLI，请检查 devcontainer" |
| `claude_process_crashed` | runtime | "Claude 进程意外退出"；带 `exitCode` / `signal` |
| `claude_api_error` | runtime | "Claude API 出错（速率限制、密钥失效等）"；带原始 message |
| `tool_exec_error` | runtime | "工具执行失败" |
| `not_supported` | runtime | "当前模式不支持该操作"（如 headless 下发 `permission_decision`） |
| `bad_request` | runtime | "协议错误"；开发期诊断用 |
| `auth_failed` | BFF / runtime | "鉴权失败" |
| `rate_limited` | BFF | "请求过于频繁" |

### 5.5 REST 端点（/git，M7 起）

以 `/git/` 为根，挂在 agent-runtime 上（JWT 保护）。BFF 以 `/api/agent/git/<taskId>/<...path>` 透明代理（`lib/agent/http-proxy.ts` + `app/api/agent/git/[taskId]/[...path]/route.ts`）。

| 方法 | 路径 | 入参 | 返回 |
|---|---|---|---|
| GET | `/git/status` | — | `{ branch, ahead, behind, files: [{path, index, worktree}] }`（porcelain v2） |
| GET | `/git/diff?path=&staged=` | `path` 可选、`staged` 默认 `false` | `{ diff, stat }` 纯文本 |
| GET | `/git/file?path=&ref=` | `ref` 默认 `HEAD` | `{ content, exists }`（ref 处的文件内容） |
| GET | `/git/worktree?path=` | — | `{ content, exists }`（磁盘上的工作区内容，含 untracked） |
| POST | `/git/commit` | `{ message, paths? }` | `{ sha, branch }`；无变更 → 409 `nothing_to_commit` |
| POST | `/git/push` | `{ branch?, setUpstream? }` | `{ branch, remote, sha, output }`；鉴权失败 → 500 `auth_failed` |

PR 创建不经 runtime，由 BFF 自己用 octokit 开：`POST /api/agent/pr/<taskId>` body `{ title, body?, head, base? }` → 调 `createPullRequest()` → 回写 `task.pr_url` → 返回 `{ url, number, state }`。

路径校验：所有 `path` 入参拒绝绝对路径、拒绝 `..`；`/git/worktree` 额外用 `path.resolve` 防逃逸。`ref` 白名单 `[\w./-]+`。

### 5.7 Filesystem REST（/fs，M9 起）

以 `/fs/` 为根，JWT 保护，BFF 代理同 `/git` 模式（`app/api/agent/fs/[taskId]/[...path]`）。

| 方法 | 路径 | 入参 | 返回 |
|---|---|---|---|
| GET | `/fs/tree?path=&depth=` | `path` 可选（默认 cwd），`depth` 默认 20 / 上限 40 | 嵌套 `{name,path,type,size?,children?,truncated?}`；dirs 在前、按字母序 |
| GET | `/fs/read?path=` | — | `{exists, content, size, mtime, binary}`；NUL 字节启发式判 binary；最大 2MB |
| POST | `/fs/write` | `{path, content}` | `{ok:true, size, mtime}`；自动 `mkdir -p` 父目录；最大 2MB |

内置忽略目录：`node_modules`, `.git`, `.next`, `.turbo`, `dist`, `build`, `out`, `.cache`, `.venv`, `__pycache__`, `.pytest_cache`, `target`, `.gradle`, `.idea`, `.vscode`（写入不受此限制）。单目录最多返回 500 条目以防爆表。

共享守卫 `src/safe-path.js`：`isSafeRelative`（非绝对路径、非 `..`）+ `resolveInside`（`path.resolve` + `path.relative` 二次校验）。同时被 `/git/worktree` / `/git/file` 使用。

### 5.6 Shell WS（/shell，M8 起）

Runtime `/shell` —— `node-pty` spawn 用户 `$SHELL`（fallback `/bin/bash`，Windows `powershell.exe`），每连接一个 pty。BFF 以 `/api/agent/shell/ws?taskId=<id>` 反向代理（`handleAgentUpgrade(..., { upstreamPath: "/shell", injectApiKey: false })`，不注入 `X-Anthropic-*` 头）。

协议（JSON，一帧一条）：

- client → server: `{type:"input", data: string}` / `{type:"resize", cols, rows}`
- server → client: `{type:"output", data: string}` / `{type:"exit", code, signal}` / `{type:"error", code, message}`

设计点：
- 用户可在终端里 `claude --resume <id>` 接管 `/agent` 的 session，共享 `~/.claude/projects/*.jsonl`（前端 `TerminalPanel` 的 "Resume Claude" 按钮直接发这条命令）
- 输出背压：单连接缓冲超 1MB 时丢弃新输出而不是 OOM；`pty.resize` 上限 500×200

## 六、鉴权与密钥流转

### 6.1 浏览器 → BFF

NextAuth session cookie（已实现），无额外改动。

### 6.2 BFF → Codespace

- **JWT**：HS256，`AGENT_RUNTIME_JWT_SECRET` 为密钥（32+ 字节随机），BFF 启动时从环境变量读
- **Claims**：`{ iss: "instant-coding-bff", aud: "instant-coding-runtime", sub: <user_id>, exp: now+300 }`
- **注入给 Codespace**：Codespace 创建时，BFF 通过 `gh codespace cp` 或 `gh api` 把 JWT 密钥写入 Codespace 的 user secret（`AGENT_RUNTIME_JWT_SECRET`）；runtime 启动读取。**同一密钥在同一 Codespace 的生命周期内不变**，不同 Codespace 之间密钥独立。
- **传输**：每次 WS 握手带 `Authorization: Bearer <jwt>`，`jwt` 由 BFF 当场签；runtime 校验失败直接关闭连接并返回 `auth_failed`。

### 6.3 API Key 流转（用户的 Anthropic key）

```
用户设置页
   │  明文
   ▼
BFF /api/settings/api-key
   │  AES-256-GCM 加密（lib/crypto.ts，已实现）
   ▼
Supabase users.anthropic_api_key_encrypted
   │  （静态存储，任何查询都是密文）
   ▼
WS 建连时 BFF 解密
   │
   ▼
WS 握手头 X-Anthropic-Api-Key: <plaintext>
   │  （TLS 保护；runtime 读完立即放进子进程 env，不落盘、不写日志）
   ▼
spawn('claude', ..., { env: { ANTHROPIC_API_KEY: key, ... } })
```

**安全约束**（runtime 侧）：
- API Key 只存在内存；进程退出即失效
- 不 `console.log(env)`；日志中间件屏蔽 `ANTHROPIC_API_KEY`、`AGENT_RUNTIME_JWT_SECRET`
- WS 握手头读完即从 upgrade 请求对象里删除

## 七、Codespace Bootstrap

用户仓库（或一个 fork/template）放一个 `.devcontainer/devcontainer.json`：

```jsonc
{
  "name": "Instant Coding",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
  "features": {
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },
  "forwardPorts": [3030],
  "portsAttributes": {
    "3030": { "label": "agent-runtime", "visibility": "private", "onAutoForward": "silent" }
  },
  "postCreateCommand": "npm i -g @anthropic-ai/claude-code @instant-coding/agent-runtime",
  "postStartCommand": "systemctl --user enable --now agent-runtime.service || pm2 start agent-runtime -- --port 3030 --cwd ${containerWorkspaceFolder}"
}
```

**服务托管**：
- 首选 `systemd --user`：runtime 自带 unit 文件（npm postinstall 写入 `~/.config/systemd/user/agent-runtime.service`），`postStartCommand` 启用
- Fallback `pm2`：没有 systemd 环境时用（Codespaces 默认有 systemd，但 Docker in Docker 场景可能没有）

**端口约定**：
- runtime 监听 `127.0.0.1:3030`
- Codespace `forwardPorts: [3030]` + `visibility: "private"` → 外部访问需 GitHub Token；BFF 用 `Octokit` 拿到 `https://<codespace-name>-3030.app.github.dev/` 形式的转发 URL
- 连接时 BFF 同时带 `Authorization: Bearer <github-token>`（Codespace 私有端口鉴权）和 `Authorization: Bearer <jwt>`（runtime 应用鉴权）—— 这里要确认 GitHub port forwarding 的鉴权方式，若二者冲突需要调整：**候选方案 A** 用 `X-Github-Token` 自定义头做端口鉴权（需要 GitHub 支持）；**候选方案 B** 把 port visibility 改为 `public` 但全靠 JWT 守护（降级，M4 不取）

**首次启动体验**：新建 Codespace 需 30s-2min（含装 runtime + claude）。UI 显示"正在启动环境…"进度，同时把启动日志（`gh api` poll 状态）流给用户。

## 八、决策记录

- **2026-04-27 架构翻转**：从"Next.js 内一次性生成 PR"改为"Codespace 内跑原生 Claude Code + BFF 代理 WS"。参照 claudecodeui 的 `server/`，但把 server 部分下放到每个用户的 Codespace。
- **2026-04-27 工具执行位置**：Agent 的所有工具在 Codespace 本机执行，不走 SSH 隧道也不在 BFF 做。
- **2026-04-27 Session 持久化**：直接用 Claude Code 的 `~/.claude/projects/*.jsonl`，DB 只存外键（codespace + session_id），不自己造消息表。
- **2026-04-27 不用 `@anthropic-ai/claude-agent-sdk`**：SDK 底层也是 spawn `claude`（`server/claude-sdk.js:160`），直接用 CLI 版本解耦 + MCP/hook/subagent 自动跟进 + shell tab 与 chat tab 共享 `~/.claude` session。代价是自己解析 stream-json 和实现 abort/permission 往返，约几百行。
- **2026-04-27 agent-runtime 常驻 vs BFF 直连 SSH**：选常驻。SSH 握手延迟、PTY 断连即 kill、文件/git 各套一层，均不可接受。
- **2026-04-27 agent-runtime 形态**：独立 GitHub repo，发布为 npm 包 `@instant-coding/agent-runtime`。devcontainer 里 `npm i -g` 安装。
- **2026-04-27 BFF ↔ Codespace 鉴权**：短期 JWT，HS256，TTL 5 分钟。密钥按 Codespace 绑定（通过 Codespace user secret 注入），不同 Codespace 密钥独立。
- **2026-04-27 Codespace 冷启动**：M4-M9 现用现起，M10 再评估预热池。
- **2026-04-27 API Key 注入**：WS 握手头传递（`X-Anthropic-Api-Key`），runtime 读取后设为子进程 env，不落盘、可轮转。
- **2026-04-27 Codespace 复用粒度**：一个仓库一个 Codespace；同用户多 chat 标签复用同一个 Codespace，不同 session 是 `claude --resume <id>` 出来的独立 `claude` 进程家族。

## 九、未决事项

当前无。新开放问题追加到本节。
