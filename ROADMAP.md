# Instant Coding 路线图

> 更新于 2026-04-27
> 技术方案详见 [ARCHITECTURE.md](./ARCHITECTURE.md)

## 一、产品定位

**Instant Coding** 是一个**云端托管的 Claude Code 工作台**。用户在浏览器里打开项目，背后每个仓库对应一个 GitHub Codespace，Codespace 里跑着原生 Claude Code 进程与一个轻量 agent-runtime；浏览器和 Codespace 实时双向通信，聊天、看 diff、开终端、改文件、提 PR 都在一个页面里完成。

一句话：**浏览器里的 Cursor + 托管的 Codespace + 原生 Claude Code**。

## 二、架构一句话

浏览器 ⟷ Next.js BFF（WS 反向代理 + Codespace 生命周期管家）⟷ Codespace 内常驻 agent-runtime + 原生 `claude` CLI。核心设计：**agent 执行完全在 Codespace 内**，BFF 不跑 AI、不跑 PTY。

完整架构、WS 协议、鉴权与密钥流转、Codespace bootstrap，详见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 三、已完成

- ✅ **M1**：Next.js 14 前端脚手架 + GitHub OAuth + Supabase（NextAuth 5）
- ✅ **M2**：任务创建流 + ANTHROPIC_API_KEY 加密存储（AES-256-GCM）
- ⚠️ **M3**：Agent Executor（`lib/agent/executor.ts`，一次性 JSON 生成模式）—— **将在 M4 上线后彻底替换**，暂保留为 fallback 对比用
- ✅ **M3.5**：Codespaces 集成（列出 / 创建 / 任务绑定）
- 🟡 **M4**：Agent Runtime PoC（`apps/agent-runtime/`）—— 核心完成：`/health` + `/agent` WS + stream-json 桥 + session 持久化验证（smoke 通过）。未完：permission bridging 作为 tech debt（headless claude 不提供）
- 🟡 **M5**：BFF WebSocket 代理 + Codespace 生命周期 —— 代码完成：自定义 `server.ts` / `lib/agent/{jwt,lifecycle,proxy,upgrade-handler}.ts` / `.devcontainer/devcontainer.json` 模板 + 示例环境变量。BFF 层 unit smoke 通过（未鉴权 401 / 缺参 400 / 常规页 200）。待用户真 Codespace + Supabase 环境做 E2E 验证

## 四、未来里程碑

### M4 — Agent Runtime MVP（在 Codespace 里跑起来）

**目标**：在一个 Codespace 里手动验证整条链路能跑，暂不接前端。

**交付**：
- 独立 repo + npm 包 `@instant-coding/agent-runtime`（目录结构、启动方式详见 [ARCHITECTURE §4.2](./ARCHITECTURE.md#42-agent-runtime独立-repo)）
- `/agent` WS 桥 + `/health` REST（先不做 `/shell` / `/fs` / `/git`，留给后续里程碑）
- 完整 WS 协议实现（见 [ARCHITECTURE §5.3](./ARCHITECTURE.md#53-消息-schema)）：`prompt` / `abort` / `permission_decision` + 所有 server→client 事件
- `.devcontainer/devcontainer.json` 模板（详见 [ARCHITECTURE §7](./ARCHITECTURE.md#七codespace-bootstrap)），`postCreateCommand` 装 claude CLI + runtime 并起服务
- JWT 鉴权（见 [ARCHITECTURE §6.2](./ARCHITECTURE.md#62-bff--codespace)）

**Done 标准**：
1. 在 Codespace 里 `gh codespace ssh -- curl localhost:3030/health` 返回 200
2. 用 `wscat` 带 JWT 连转发端口 `/agent`，发一条"给 `utils.ts` 加 `formatDate` 函数"，能看到流式 `tool_call` / `tool_result` / `message` / `complete`
3. 同时进 shell 跑 `claude --resume <sessionId>` 能看到同一个 session 的完整历史（验证人机 session 共享）

### M5 — BFF WebSocket 代理 + Codespace 生命周期

**目标**：浏览器打开任务 → 命中对应 Codespace → 建立 WS 隧道。

**交付**：
- 自定义 `server.js` 处理 WS 升级（替换现有 `server.js`）
- `lib/agent/proxy.ts` + `lib/agent/lifecycle.ts` + `lib/agent/jwt.ts`（详见 [ARCHITECTURE §4.1](./ARCHITECTURE.md#41-nextjs-bff)）
- Codespace 状态机：`Shutdown → Starting → Available → Stopped`，自动 boot、poll 到 Available 再代理
- 错误语义：`codespace_boot_failed` / `runtime_unreachable` / `auth_failed` 等（见 [ARCHITECTURE §5.4](./ARCHITECTURE.md#54-错误码表)）
- `AGENT_RUNTIME_JWT_SECRET` 注入到 Codespace user secrets 的机制

**Done 标准**：浏览器 console 能 `new WebSocket("/api/agent/ws?taskId=<uuid>")` 跑通一轮完整对话；Codespace 若 Stopped 能自动 boot。

### M6 — 真 Chat 页（替换 mock）

**目标**：`/chat/[id]` 从状态展示页变成可用对话页。

**交付**：
- 拆掉 `components/chat-panel.tsx` 的 mock（setTimeout 假响应）
- 新组件 `components/agent-chat.tsx`，消费 M5 的 WS
- UI 分支渲染：assistant text、tool call（可折叠，显示参数）、tool result、permission request（需用户 approve 才继续）、错误、token 用量
- 可中断（发 `{ type: "abort" }`）
- 多轮对话（复用 `sessionId`）
- 轮询机制下线（`useTask` 里的 3s poll 删除）
- 下线 `lib/agent/executor.ts`

**Done 标准**：用户能在产品内完整跟 Claude 多轮对话，中途可打断、可批准/拒绝工具调用。

### M7 — Diff 审查 + Git 面板

**目标**：看得见 Claude 改了什么，人可以在 merge 前审。

**交付**：
- agent-runtime 加 `/git/status`、`/git/diff`、`/git/commit`、`/git/push` REST
- 前端 diff tab（Monaco diff viewer），左右对比
- 一键"Commit & Push & 开 PR"（复用已有 `lib/github/client.ts`）
- `task.diff` 字段弃用，改为动态拉 runtime

**Done 标准**：Claude 生成代码后，用户在页面内审完 diff，点一下就开 PR。

### M8 — 终端面板（xterm.js）

**目标**：产品内有真终端，可看 Claude 执行、也可人工执行。

**交付**：
- agent-runtime 加 `/shell` WS（`node-pty` spawn bash）
- 前端 xterm.js 终端 tab，支持 resize / 复制粘贴 / ANSI 颜色
- 可选：一键 `claude --resume <session-id>` 把 chat 的 session 接管到终端

**Done 标准**：用户在浏览器里能跑 `pnpm test`、看实时输出；在 chat 页聊到一半切到 shell 页接着 `claude --resume` 无缝续聊。

### M9 — 文件树 + 内嵌编辑

**交付**：
- agent-runtime 加 `/fs/tree`、`/fs/read`、`/fs/write` REST（路径 sandbox 到 repo 目录）
- 前端 Monaco 编辑器 + 文件树 + 多 tab
- `chokidar` → WS 事件推送文件变更

### M10 — 可观测性 & 运营

**交付**：
- 每会话 token 用量（从 `token_usage` 事件采集）→ 实时显示 + 存 DB
- Codespace 空闲超过 N 分钟自动 stop（省钱）
- 任务级错误分类统计：`codespace_boot_failed` / `runtime_unreachable` / `claude_api_error` / `tool_exec_error` / `user_abort`
- 仪表盘：用户看自己历史任务 + 成本；管理员看系统健康
- 评估 Codespace 预热池（在此之前都是现用现起）

### M11 — MCP & 工具生态

**交付**：
- 产品内管理 MCP servers（UI 写 `~/.claude.json`）
- Permission approval UX 打磨（参考 claudecodeui 的 tool-approval 界面）
- `components/quick-actions.tsx` 真正接入 prompt 模板库

### M12 — 多租户深化 & 协作（远期）

- 组织 / 团队工作区，共享 prompt 模板
- 审阅人分配 / 评论
- GitLab、Bitbucket 支持
- VS Code 插件入口（把 agent-runtime 嵌进插件里，不强制 Codespace）

## 五、需清理/替换的已有代码

| 文件/表 | 处置 | 对应里程碑 |
|---|---|---|
| `lib/agent/executor.ts` | 下线 | M6 |
| `components/chat-panel.tsx` | 重写为 `agent-chat.tsx` | M6 |
| `app/chat/[id]/page.tsx` 的 3s poll | 删除，改 WS | M6 |
| `components/code-editor.tsx` | 用 Monaco 重写 | M9 |
| `components/quick-actions.tsx` | 对接 prompt 模板 | M11 |
| `environments` 表 | 从 schema 删除（已被 `codespaces` 替代） | M10 |
| `task.diff` / `task.logs` 字段 | 保留但停写，改为动态拉 runtime | M7 / M8 |
