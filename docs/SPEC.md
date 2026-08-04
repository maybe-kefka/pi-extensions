# SPEC — @kefka/pi-web

> 状态：已确认（2025-08-03 与用户逐题对齐）
> 仓库：`~/projects/pi-extensions`（npm workspaces monorepo，包名模式 `@kefka/pi-*`）

## 1. 概述

### 1.1 目标
提供 `/web` 命令：在**当前 pi 进程内**启动一个本地 Web 控制台（HTTP + WebSocket），与 TUI 共享同一个 session，实现**完整双向控制**——浏览器里能看消息流、看工具执行、看状态，也能发消息、切会话、切模型、调思考等级。

### 1.2 定位
- **完整双向控制台**（非只读监视器）：web 与 TUI 是同一 session 的两个控制面。
- 进程模型：**单进程**。web 服务器由扩展在 TUI 进程内启动；不存在独立的 pi RPC 子进程。
- "RPC"一词在本 SPEC 中指**扩展自定义的 JSON-RPC 2.0 形态协议**（走 WebSocket），不是 pi 的 `--mode rpc`（那是独立进程的 stdin/stdout JSONL，TUI 进程内不存在）。

### 1.3 v1 范围（已确认）

| 能力 | 来源 | v1 |
|---|---|---|
| 发消息 / abort | `pi.sendUserMessage` / `ctx.abort` | ✅ |
| 消息流（流式回复 / thinking / 工具执行） | `pi.on("message_*")` / `pi.on("tool_execution_*")` | ✅ |
| 会话：**列表** | `SessionManager.list(ctx.cwd)`（静态导入，peer 依赖 pi 提供） | ✅ |
| 会话：**切换 / 新建** | `ctx.switchSession` / `ctx.newSession` | ❌ **API 限制（见 §1.4 / §9）**：仅存在于命令上下文（`ExtensionCommandContext`），事件 ctx 与 `pi.*` 均不可达，扩展无命令派发入口 → 只能 TUI 执行 `/resume` `/new` |
| 模型：列表 + 切换 + 思考等级 | `ctx.modelRegistry.getAvailable()` / `pi.setModel` / `pi.getThinkingLevel` / `pi.setThinkingLevel` | ✅ |
| 状态面板（上下文占用 / token / 模型 / 会话名） | `ctx.getContextUsage()` + 事件聚合 | ✅ |
| 扩展命令**列表展示**（不执行） | `pi.getCommands()` | ✅（仅展示） |
| 树导航 / fork / clone | `ctx.navigateTree` / `ctx.fork` | ❌ v2（同为命令上下文限制） |

### 1.4 非目标（v1 明确不做）
- **不从 web 执行任意扩展命令**。源码核实：`pi.sendUserMessage()` 硬编码 `expandPromptTemplates: false` 调 `prompt()`，跳过命令处理；`_tryExecuteExtensionCommand` 是 AgentSession 私有路径；`pi.getCommands()` 只返回元信息（不含 handler）。公共 API 无命令派发入口。`pi:listCommands` 仅作展示；上游 feature 建议（`sendUserMessage` 增加选项或暴露 `executeCommand`）记录在 §9。
- **不从 web 切换/新建会话**（v1 实现时新发现）：`ctx.switchSession` / `ctx.newSession` / `ctx.fork` / `ctx.navigateTree` / `ctx.waitForIdle` / `ctx.reload` 只存在于 `ExtensionCommandContext`（`runner.createCommandContext()` 附加，事件 ctx 的 `createContext()` 不含），且扩展无命令派发入口 → web 端不可达。会话列表（`SessionManager.list`）可用，web 显示列表并提示在 TUI 执行 `/resume`、`/new`。上游建议：在 `ExtensionAPI` 暴露 `switchSession`/`newSession` 或允许命令编程式派发。
- 不重定向/转发 pi 内置命令的 picker（如内置 `/session` 的选项列表）：内置命令在 interactive mode 内联处理，绕过扩展系统（不触发 `input` 事件、不产生消息），扩展无事件携带其选项列表或选择结果。web 端的会话/模型选择器是**用公开 API 重新实现**的等价功能（会话列表可看，切换受限）。
- 不做树导航 / fork / clone（v2；同受命令上下文限制）。
- 不做 `--host` 局域网绑定（v1 固定 127.0.0.1，见 §5）。
- 不引前端框架、无构建步骤 —— **v2（2025-08 重构）改为 React + Vite + Tailwind + shadcn，有构建步骤**（见 §7）。

### 1.5 依赖原则
- **扩展运行时依赖仅 `ws`**（WebSocket 服务端实现，纯 JS；放 `dependencies`，分布式包运行时依赖必须在 dependencies）。
- `@earendil-works/pi-coding-agent` 作**类型导入**（devDependency）+ `SessionManager` **值导入**（列表会话，peerDependencies 声明，由 pi 宿主经 jiti 别名提供）。
- `@types/ws` 仅开发用（devDependency）。
- HTTP 服务器用 Node 内置 `node:http`；静态文件用几十行 MIME 映射手工输出，不引 express。
- **前端（`packages/pi-web/web` 子工作区 `pi-web-frontend`）：React 19 + Vite 8 + Tailwind v4 + shadcn（new-york/zinc）**，全部为**构建期依赖**（不影响扩展运行时）；构建产物 `web/dist` 提交进 git、随 npm 包发布（`files: ["src", "web/dist"]`）。

## 2. 命令定义

- 名称：`web`（输入 `/web` 触发）
- 注册方式：`pi.registerCommand("web", { description, handler })`
- 仅命令，不注册 tool。

### 2.1 参数语法
- `--port <n>` / `--port=<n>` / `-p <n>`：指定端口。**`--port 0` 等价随机**（缺省行为）；非数字 → 报错。
- `--open`：打开默认浏览器（平台探测，见 §6）。
- `--stop`：手动关闭服务（优雅：向已连接客户端发 close 帧，关 HTTP server）。
- 未知参数 → 报错并打印用法。
- 参数解析为纯函数（`src/args.ts`），TDD。

### 2.2 服务状态语义（进程级单例）
| 场景 | 行为 |
|---|---|
| 首次 `/web`（无 `--stop`） | 启动服务（随机或指定端口）→ 打印 URL → 有 `--open` 则打开浏览器 |
| 服务已在运行，再次 `/web` | **只打印当前 URL**（`--open` 则再开一次浏览器），不重启、不换端口 |
| 服务已在运行，但本次带不同 `--port` | **报错**："已在 <url> 运行，先 /web --stop 再换端口" |
| `/web --stop` | 优雅关闭；未运行则提示 |

- 输出通道：TUI 模式 `ctx.ui.notify(url, "info")` 打印 URL；非 TUI 模式同样 notify（rpc 模式 fire-and-forget 可用）。

## 3. 服务生命周期（已确认）

- **进程级单例**：懒启动（首次 `/web`）；`/web --stop` 手动关。
- **`session_shutdown` 按原因选择性关闭**：
  - `reason: "reload"` / `"quit"` → **关闭服务**（`/reload` 会重新求值扩展模块，旧 server 句柄无人持有，不关即泄漏：端口继续被占、新实例管不到）。
  - `reason: "new"` / `"resume"` / `"fork"` → **不关**（同一进程切会话，web 界面不断线；web 端自身也实现了会话切换）。
- 扩展工厂函数**不启动任何后台资源**（socket/server/timer）；服务启动、事件订阅绑定都在 `session_start` / `/web` handler 内完成，`session_shutdown` 中按上述规则清理。
- 停止语义：向所有已连接客户端发 WS close 帧 → 关 `ws.Server` → 关 `node:http` server。

## 4. 网络协议（WebSocket，JSON-RPC 2.0 形态）

### 4.1 传输
- 单条 WebSocket 连接（`ws` 库）；消息为 UTF-8 文本帧，每帧一个 JSON 对象（WS 已有帧边界，不套 JSONL）。
- **广播**：所有已连接客户端收到同一份事件流，无订阅粒度；连接上限 16（防御性，超出拒绝新连接）。
- 客户端→服务器：请求 `{jsonrpc: "2.0", id, method, params}`；服务器应答 `{jsonrpc: "2.0", id, result}` 或 `{jsonrpc: "2.0", id, error: {code, message}}`。
- 服务器→客户端：notification `{jsonrpc: "2.0", method: "pi:event", params: {type, ...}}`（无 id）。

### 4.2 服务器→客户端事件（全部经 `pi.on` 订阅转发）

| `params.type` | 来源 | 内容要点 |
|---|---|---|
| `message_start` / `message_update` / `message_end` | `pi.on("message_*")` | 消息流（用户 / 助手流式 / thinking / toolResult）；`message_update` 走合并节流 |
| `tool_execution_start` / `tool_execution_update` / `tool_execution_end` | `pi.on("tool_execution_*")` | 工具执行 |
| `agent_start` / `agent_end` / `agent_settled` | 同上 | busy 状态 |
| `queue_update` | 同上 | 待处理队列 |
| `state` | `session_start` / `session_info_changed` / `model_select` / `thinking_level_select` / `message_end` / `session_compact` 聚合 | 会话名 / 模型 / 思考等级 / 上下文占用 / isStreaming |
| `session_before_switch` / `session_shutdown` / `session_start` | 同上 | TUI 里跑 `/new`/`/resume` 时 web 跟随切换 |
| `notify` / `setStatus` / `setWidget` | `ctx.ui` 桥接（见 §4.3） | 各扩展的 UI 输出透传 |

- **不转发 `pi.on("input")`**：用户消息已由 `message_*`（user 角色）覆盖；transform/handled 且不产生消息的边角场景不处理。
- **流式合并节流**：`message_update`（及 `tool_execution_update`）逐 token/分块到达，统一进合并器：~60ms flush 一次；`message_end` / `tool_execution_end` 立即 flush（防尾部延迟）。

### 4.3 ctx.ui 桥接（已确认）
- `ctx.ui.notify` / `ctx.ui.setStatus` / `ctx.ui.setWidget` 的调用**透传**为上述 `notify` / `setStatus` / `setWidget` 事件发给 web（TUI 本地行为不变，两边都显示）。
- 实现方式：`pi-web` 内部持有这些方法的包装器（在扩展初始化时替换/拦截）或由事件订阅者自行转播——**v1 采用包装器**：扩展在 `session_start` 里用 `ctx.ui` 包装后广播；降级路径：不可包装时静默跳过（不阻塞原调用）。

### 4.4 客户端→服务器方法

| method | params | 实现 |
|---|---|---|
| `pi:sendMessage` | `{text, deliverAs?}` | `pi.sendUserMessage(text, {deliverAs})`；**streaming 中缺 `deliverAs` → 报错**（对齐 RPC `prompt` 语义：idle 立即发并触发 turn；忙碌必须显式 `"steer"` / `"followUp"`） |
| `pi:abort` | — | `ctx.abort()` |
| `pi:listSessions` | — | `SessionManager.list(ctx.cwd)`（**值导入** `SessionManager`，peer 依赖 `@earendil-works/pi-coding-agent`——由 pi 宿主经 jiti 别名提供） |
| `pi:switchSession` | `{path}` | **不可用**：命令上下文专属 → 返回错误提示 TUI `/resume`（SPEC §9） |
| `pi:newSession` | — | **不可用**：同上，提示 TUI `/new` |
| `pi:listModels` | — | `ctx.modelRegistry.getAvailable()` |
| `pi:setModel` | `{provider, modelId}` | 从 getAvailable 找到模型 → `pi.setModel(model)`（返回 false → 报错"无 API key"） |
| `pi:getThinkingLevel` | — | `pi.getThinkingLevel()` |
| `pi:setThinkingLevel` | `{level}` | `pi.setThinkingLevel(level)`（clamp 交给 pi） |
| `pi:listCommands` | — | `pi.getCommands()`（**仅展示**，不提供执行） |
| `pi:getMessages` | — | `ctx.sessionManager.getEntries()` 过滤 message 条目 → `{messages: [{role, text}]}`（页面加载回填历史用） |
| `pi:getState` | — | 快照：会话文件/id/名、模型、思考等级、上下文占用、isStreaming、messageCount |

- 错误：JSON-RPC error；`code` 语义自定（如 `-32602` 参数错、`1` 业务错、`2` 忙碌需 deliverAs），消息为人类可读中文。

## 5. 安全（已确认）

- **只绑定 `127.0.0.1`**（不做 `--host`）。
- **随机 token 入 URL**：`http://127.0.0.1:<port>/?token=<random>`。
- **授权链（2025-08 重构扩展）**：query token OR `x-web-token` header OR **`piweb` HttpOnly cookie**。首次带 token 访问后服务器 `Set-Cookie: piweb=<token>; HttpOnly; SameSite=Strict; Path=/`；浏览器子资源（`/assets/*.js`）**不携带页面 URL 的 query**，靠 cookie 自动通过校验（修复 vanilla 版子资源 403 白屏隐患）。`/ws` 仍用显式 query token。
- token 在服务启动时生成（`crypto.randomBytes`），URL 稳定不变（重复 `/web` 打印同一 URL）。
- 动机：绑定 localhost 挡住外部网络；token + SameSite=Strict cookie 挡住本机浏览器侧攻击（恶意网页可向 `http://127.0.0.1:<port>/` 发 POST 表单，CORS 不挡写操作）。
- 已知代价：token 会留在浏览器历史——本地开发工具可接受。

## 6. `--open` 平台行为（已确认）

- 检测 `process.env.TERMUX_VERSION` → `termux-open-url <url>`（Termux，符合项目 AGENTS.md）。
- darwin → `open <url>`；linux 且 `xdg-open` 可用 → `xdg-open <url>`；否则**只打印 URL**。
- **fire-and-forget**：spawn 后不阻塞 `/web` 命令（不 await 浏览器退出）。
- 实现用 `pi.exec` 或 node `spawn`（扩展 API 有 `pi.exec`；若需 detach 用 node child_process spawn，v1 用 `pi.exec` 带超时兜底即可）。

## 7. 前端（已确认，2025-08 重构为 React 栈）

- **技术栈**：React 19 + Vite 8 + TypeScript strict + Tailwind v4（CSS-first，`@import "tailwindcss"`）+ shadcn（new-york 风格 / zinc 基色 / CSS variables 暗色主题，`<html class="dark">`）；图标 lucide-react；无路由（单页）。
- **工程位置**：`packages/pi-web/web/` 子工作区（`pi-web-frontend`，private），独立 `package.json`/`vite.config.ts`；构建产物 `web/dist/`。
  - 构建：`npm run build:web`（根）/ `npm run build -w pi-web-frontend`；`npm publish` 时 `prepublishOnly` 先构建（`cd web && npm run build`）。
  - **`web/dist` 提交进 git**（个人仓库开箱即用）；`/web` 启动前检查 `dist/index.html` 存在，缺失则报错提示先构建。
- **布局**：header（连接状态 / 会话名 / 模型 / 思考等级 / 上下文占用条）+ chat 流 + 侧栏（会话列表只读、模型选择、思考等级、命令列表只读、状态桥接面板）+ 输入区。
- **交互升级（v2 重构）**：thinking 与工具输出**可展开/收起**（工具输出折叠态截断 ~1200 字符）；**跟随滚动开关**（上翻暂停自动滚动，出现"回到底部"按钮）；输入框为多行 `Textarea`（Enter 发送 / Shift+Enter 换行）；**断线横幅** + 指数退避重连（≤10s）。
- **状态管理**：单 `useReducer` 根 store；WS 事件流 → reducer action（`web/src/lib/stream.ts` 纯 reducer，单测覆盖）。
- **模块**：`web/src/lib/rpc.ts`（WS 客户端）/ `stream.ts`（reducer）/ `types.ts`（协议类型镜像）/ `components/`（Header/Chat/Sidebar/InputBar/DisconnectBanner）+ `components/ui/`（shadcn）。
- **加载历史**：连接建立后调 `pi:getMessages` 回填 user/assistant 消息（新方法，见 §4.4）。
- **渲染策略**：`message_*` 增量更新聊天流；`state` 事件更新侧栏/头部；无虚拟滚动（v1 限制，文档注明）。

## 8. 状态快照口径

- 上下文占用：`ctx.getContextUsage()` 的 `tokens` / `contextWindow` / `percent`（0-100 百分数，**边界归一化为 0-1 比例**再入协议，与 pi-status 口径一致）；`tokens` 为 null → 前端显示"待更新"。
- 会话信息：`ctx.sessionManager.getSessionFile()` / `getSessionId()`；名称用 `pi.getSessionName()`。
- 模型：`ctx.model`（id/provider/name）；思考等级 `pi.getThinkingLevel()`。
- busy：以 `agent_start/end/settled` 聚合（与 `ctx.isIdle()` 在事件点采样，二者不一致时以事件为准，SPEC 注明）。
- 触发 `state` 推送的事件点见 §4.2 表；客户端也可主动 `pi:getState` 拉全量。

## 9. 已知限制与上游建议

- **无法从 web 执行任意扩展命令**（`pi:listCommands` 仅展示）。建议上游：`pi.sendUserMessage` 增加 `expandPromptTemplates` 选项（默认 false 不变），或暴露 `executeCommand(name, args)`。
- **无法从 web 切换/新建会话**（v1 实现时源码核实）：`newSession` / `fork` / `navigateTree` / `switchSession` / `waitForIdle` / `reload` 仅存在于 `ExtensionCommandContext`（`runner.createCommandContext()` 定义，`createContext()` 的事件 ctx 不含）；扩展 API 无命令派发入口；`sendUserMessage` 跳过命令处理。web 端会话列表可看，切换需 TUI `/resume`、`/new`。建议上游：在 `ExtensionAPI` 增加 `switchSession`/`newSession`，或暴露命令派发。
- **看不到内置 picker 的选项列表**（如 `/session`、`/model` 的 TUI 选择器）：内置命令绕过扩展系统；web 端等价能力为 §4.4 的 `pi:listSessions` / `pi:listModels` 重新实现（列表可看；会话切换受限见上条）。
- 树导航 / fork / clone（v2）：`ctx.navigateTree` / `ctx.fork` 已备好，但同受命令上下文限制，且缺前端树形 UI。
- **ctx 生命周期**：session_start 捕获的 ctx 在会话内有效（`runner.assertActive` 仅在 session dispose 时抛错）；切换间隙 `state.ctx` 置空，WS 请求返回 `code 3 会话未就绪`，客户端重试即可。
- **`/reload` 或切到不同 cwd 的会话**会清空扩展模块缓存 → 模块状态丢失；`session_shutdown(reason=reload)` 已关闭服务，重跑 `/web` 即可。

## 10. 模块划分（src 纯函数层全部 TDD；index.ts 薄接线层不做单测）

| 文件 | 职责 | 类型 |
|---|---|---|
| `src/index.ts` | 薄接线：`registerCommand("web")`、参数解析、服务启停、`pi.on` 订阅→广播（含 60ms 合并节流）、WS 方法→ctx/api 调用、ctx.ui 桥接包装、平台浏览器打开 | 薄层（无单测） |
| `src/args.ts` | `/web` 参数解析纯函数 | 纯函数（TDD） |
| `src/protocol.ts` | JSON-RPC 编解码：请求/响应/notification 构造与解析、id 校验、错误对象 | 纯函数（TDD） |
| `src/coalescer.ts` | 流式合并节流器（批收集、flush、flushNow、超时） | 纯函数/可注入时钟（TDD） |
| `src/events.ts` | pi 事件 → 协议事件映射（纯：输入事件对象 + 状态采样 → 输出 notification 载荷） | 纯函数（TDD） |
| `src/state.ts` | `pi:getState` 快照 + `state` 事件载荷构造（归一化 percent、缺省处理） | 纯函数（TDD） |
| `src/http-util.ts` | MIME 映射 / 路径穿越防护 / token 比对与提取（纯函数，供 server 使用） | 纯函数（TDD） |
| `src/server.ts` | node:http + ws 组装、token 校验、静态文件路由、连接管理、JSON-RPC 派发 | 薄层（可测逻辑下沉 http-util/protocol） |
| `web/` | 前端静态文件 | — |

### 10.1 测试策略
- 纯函数层（args/protocol/coalescer/events/state）：vitest 单测全覆盖边界（空输入、坏 JSON、非法端口、超时 flush、token 不匹配等）。
- `server.ts` 仅薄层；路由/token 判定等可测逻辑下沉纯函数。
- `index.ts` 不做单测；端到端靠手动验证（T6）。
