> **系统基线 SPEC（v1 归档）**：本文件为 pi-web 的历史系统级规格（协议/安全/状态口径等技术基线）。
> 自 R19 起不再追加新内容——每次迭代的规格独立落盘到 `.agents/specs/<slug>/SPEC.md`（依据 `/skill:to-spec` 生成，无本地模板），
> 需引用本基线时写"基线 SPEC §X"。迭代工作草稿在 `.scratch/<slug>/`（gitignore），完成后归档。

---
# SPEC — @kefka/pi-web

> 状态：已确认（2025-08-03 与用户逐题对齐；2026-08 R16 交互大改：气泡 ChatGPT 式渲染 / 上拉框 / 发送-abort 融合）
> 仓库：`~/projects/pi-extensions`（npm workspaces monorepo，包名模式 `@kefka/pi-*`）

## 1. 概述

### 1.1 目标
提供 `/web` 命令：在**当前 pi 进程内**启动一个本地 Web 控制台（HTTP + WebSocket），与 TUI 共享同一个 session，实现**完整双向控制**——浏览器里能看消息流、看工具执行、看状态，也能发消息、切会话、切模型、调思考等级。

### 1.2 定位
- **完整双向控制台**（非只读监视器）：web 与 TUI 是同一 session 的两个控制面。
- 进程模型：**单进程**。web 服务器由扩展在 TUI 进程内启动；不存在独立的 pi RPC 子进程。
- "RPC"一词在本 SPEC 中指**扩展自定义的 JSON-RPC 2.0 形态协议**（走 WebSocket），不是 pi 的 `--mode rpc`（那是独立进程的 stdin/stdout JSONL，TUI 进程内不存在）。

### 1.3 能力矩阵（当前状态）

| 能力 | 来源 | 状态 |
|---|---|---|
| 发消息 / abort | `pi.sendUserMessage`（**每次请求取最新 pi**，见 §3）/ `ctx.abort` | ✅ |
| 消息流（流式回复 / thinking / 工具执行 / 轮次边界） | `pi.on("message_*")` / `pi.on("tool_execution_*")` / `pi.on("turn_*")` | ✅ |
| 会话：**列表 / 树数据** | `SessionManager.list(ctx.cwd)`（静态导入，peer 依赖 pi 提供）/ `ctx.sessionManager.getTree()` | ✅ |
| 会话：**切换 / 新建 / fork / clone / 树导航** | **特权 ctx 捕获链**（§3.1）：`/web` handler 捕获 `ExtensionCommandContext`，`withSession` 回调续链 | ✅（TUI 手动切换后降级，§3.1 / §9） |
| 内置命令派发子集 | 同上（resume / new / fork / clone / tree / compact / name / model / 思考等级 / abort） | ✅ |
| 扩展命令 / prompt 模板 / skill 命令 | ❌ 无公开执行 API（`sendUserMessage` 硬编码跳过命令处理）；**不展示不派发** | ❌（上游 feature 建议见 §9） |
| 模型：列表 + 切换 + 思考等级 | `ctx.modelRegistry.getAvailable()` / `pi.setModel` / `pi.getThinkingLevel` / `pi.setThinkingLevel` | ✅ |
| 状态面板（上下文占用 / token / 模型 / 会话名） | `ctx.getContextUsage()` + 事件聚合 | ✅ |
| 删除会话 | fs unlink（非官方 API，见 §4.4 `pi:deleteSession`） | ✅（仅非当前会话） |
| 重命名会话 | `pi.setSessionName` | ✅ |
| 输入辅助："+" 弹层（全部 skills + 工作目录文件） | `pi.getCommands()`（`source: "skill"`）/ 后端 `pi:listFiles`（gitignore） | ✅ |
| 输入辅助：**space+/**（skills + 命令上拉框）与 **space+@**（文件上拉框） | `pi:listSkills` / `pi:listCommands` / `pi:listFiles` | ✅（R16） |
| 命令元信息列表 | `pi:listCommands`（非 skill 命令，`/` 上拉框用） | ✅（R16） |

### 1.4 非目标（明确不做）
- **不从 web 执行扩展命令**（含 prompt 模板与 skill 命令，均无公开执行 API）。源码核实：`pi.sendUserMessage()` 硬编码 `expandPromptTemplates: false` 调 `prompt()`，跳过命令处理；`_tryExecuteExtensionCommand` 是 AgentSession 私有路径；`pi.getCommands()` 只返回元信息（不含 handler）。**R16 决策更新：`/` 上拉框展示 skills + 命令，但选中后一律以纯文本插入输入框**（`/skill:name`、`/compact` 等原样发送，pi 收到后按普通消息处理——web 端无法执行命令的现状不变）。上游 feature 建议（`sendUserMessage` 增加 `expandPromptTemplates` 选项或暴露 `executeCommand`）记录在 §9。
- **不从 web 派发 `/reload`、`/quit`**：`ctx.reload()` 会重载扩展 → 按 §3 关闭 web server 自身（断线）；`ctx.shutdown()` 会优雅退出整个 pi 进程。两者留 TUI。
- **不派发 TUI-only 命令**：`/export` `/import` `/share` `/copy` `/login` `/logout` `/settings` `/trust` `/changelog` `/hotkeys` `/scoped-models` `/debug`（及彩蛋）为 TUI 选择器 / OAuth 流程 / 剪贴板 / 设置菜单专属，无公开 API，命令面板不展示。
- **删除会话仅限非当前会话**：无官方 API（`SessionManager` 无 delete 方法，TUI 亦无删除功能），pi-web 直接 unlink session 的 jsonl 文件（`SessionManager.list` 扫目录，删除后列表自然消失）；当前会话删除按钮禁用。
- 不重定向/转发 pi 内置命令的 picker（如内置 `/session` 的选项列表）：内置命令在 interactive mode 内联处理，绕过扩展系统（不触发 `input` 事件、不产生消息），扩展无事件携带其选项列表或选择结果。web 端的会话/模型选择器是**用公开 API 重新实现**的等价功能。
- 不做 `--host` 局域网绑定（固定 127.0.0.1，见 §5）。
- 前端为构建步骤工程（React + Vite + Tailwind + shadcn，见 §7），构建产物 `web/dist` 提交进 git。

### 1.5 依赖原则
- **扩展运行时依赖仅 `ws` + `ignore`**（WebSocket 服务端实现 + gitignore 语法解析，均纯 JS 零依赖；放 `dependencies`，分布式包运行时依赖必须在 dependencies）。
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

### 3.1 会话替换与 ctx 生命周期（v-next 源码核实，2026）

- **扩展工厂每次 session 创建都会重跑**（`loadExtension` → `await factory(api)`，模块级缓存只缓存模块导入，工厂函数体每次执行）：新 session → 新 `ResourceLoader` → 新共享 runtime → 新 pi 对象。pi-web 在 factory 里重绑 `state.api`，因此 **TUI 手动切换后，发消息 / 模型 / 思考等级 / 命令列表自动恢复**（WS 请求每次取最新 api）。
- **模块级变量跨会话保留**：web server 单例、token、coalescer 存活于模块闭包 → 切换不重启服务、WS 不断线（与上表一致）。
- **特权 ctx（`ExtensionCommandContext`）只在命令执行时创建**，`/web` handler 捕获；会话替换（`switchSession` / `newSession` / `fork`）会 dispose 旧 session → 旧捕获 ctx 的 `assertActive()` 抛错（上游错误消息明示：captured ctx 仅会话内有效，后置工作必须放 `withSession` 回调）。
- **withSession 续链**：pi-web 发起的会话操作一律带 `withSession: async (fresh) => { state.privileged = fresh }`，切换后特权 ctx 自动指向新会话。**TUI 手动切换时 pi-web 无法重新捕获**（事件 ctx 无特权方法）→ 特权命令（resume/new/fork/clone/tree）降级：请求返回明确错误提示"在 TUI 重跑 /web 恢复"；前端侧栏常驻提示条。非特权能力不受影响。
- **`pi` 对象与事件 ctx 的 stale 语义**：捕获的 pi / command ctx 在会话替换后抛错（错误消息含 `stale`，server 层映射为 `code 3`）；事件 ctx 每事件新建、getter 调用时动态解析，永远新鲜。WS 请求处理统一走"最新捕获"（api / 事件 ctx / 特权 ctx 三态）。

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
| `turn_start` / `turn_end` | `pi.on("turn_*")` | 轮次边界（前端气泡聚合：turn_end 携带完整 message + toolResults，用于 final 兜底） |
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
| `pi:switchSession` | `{path}` | **特权 ctx**：`privileged.switchSession(path, {withSession: 续链})`；无特权 → 错误提示 TUI 重跑 `/web` |
| `pi:newSession` | — | **特权 ctx**：`privileged.newSession({withSession: 续链})` |
| `pi:fork` | `{userIndex}` | **特权 ctx**：`getEntries()` 按顺序数 user 消息（0-based）解析 entryId → `privileged.fork(entryId, {position: "before", withSession: 续链})`（对齐 TUI `/fork`：从该 user 消息前分叉） |
| `pi:clone` | — | **特权 ctx**：`privileged.fork(leafId, {position: "at", withSession: 续链})`（`leafId = ctx.sessionManager.getLeafId()`，对齐 TUI `/clone`） |
| `pi:navigateTree` | `{targetId}` | **特权 ctx**：`privileged.navigateTree(targetId)` |
| `pi:getTree` | — | `ctx.sessionManager.getTree()`（事件 ctx 即可） |
| `pi:deleteSession` | `{path}` | fs unlink（**非官方**）：校验 path 为 `.jsonl` 且位于 session 目录内（防穿越）、**非当前会话** → `unlink`。当前会话 / 校验失败 → 业务错误 |
| `pi:listModels` | — | `ctx.modelRegistry.getAvailable()` |
| `pi:setModel` | `{provider, modelId}` | 从 getAvailable 找到模型 → `pi.setModel(model)`（返回 false → 报错"无 API key"） |
| `pi:getThinkingLevel` | — | `pi.getThinkingLevel()` |
| `pi:setThinkingLevel` | `{level}` | `pi.setThinkingLevel(level)`（clamp 交给 pi） |
| `pi:setSessionName` | `{name}` | `pi.setSessionName(name)`（`session_info_changed` 事件刷新列表） |
| `pi:listSkills` | — | `pi.getCommands()` 过滤 `source === "skill"` → `[{name, description}]`；**name 去除 `skill:` 前缀**（pi 返回 `skill:code-review`，前端展示/插入需裸名） |
| `pi:listCommands` | — | `pi.getCommands()` 过滤 `source !== "skill"` → `[{name, description}]`（`/` 上拉框非 skill 命令，选中插纯文本；**不执行**，见 §1.4） |
| `pi:listFiles` | `{maxDepth?, limit?}` | `src/file-lister.ts`：递归扫描 `ctx.cwd`（默认 3 层 / 200 上限），gitignore 排除（`ignore` 包，含嵌套 `.gitignore`），按目录分组 → `{groups: [{dir, entries: [{name, path, isDir}]}]}`（**含目录条目**，`isDir` 区分，R17） |
| `pi:getMessages` | — | `getEntries()` 过滤 message 条目 → `{messages: [{role, text, thinking, toolCalls: [{id, name, arguments, result, isError}], userIndex?}]}`：assistant 带 thinking/toolCalls（toolCallId 配对 toolResult）；**user 消息带 `userIndex`**（该会话第几条 user，0-based，供前端气泡 fork 用）；空消息（无 text/thinking/toolCalls）筛掉 |
| `pi:getState` | — | 快照：会话文件/id/名、模型、思考等级、上下文占用、isStreaming、messageCount |
| `pi:getContextBreakdown` | — | 上下文占用分类估算（与 pi-status 同款 chars/4 逻辑，`src/context-breakdown.ts`）：`ctx.getSystemPromptOptions()`（customPrompt/promptGuidelines/appendSystemPrompt/contextFiles/skills/toolSnippets，运行时普通会话 ctx 提供，类型仅在 command ctx 声明——index.ts 内交叉类型断言）+ `ctx.sessionManager.buildContextEntries()` → 五类（系统提示词/上下文文件/技能/工具定义/对话消息）+ 对话细分（user/assistant/toolResult/other）+ total；`usage` = getContextUsage（percent 归一化 0-1）。**非特权数据源，TUI 手动切会话后依然可用** |

- 错误：JSON-RPC error；`code` 语义自定（如 `-32602` 参数错、`1` 业务错、`2` 忙碌需 deliverAs、`3` ctx stale/会话未就绪），消息为人类可读中文。
- **特权 ctx 缺失/失效**（TUI 手动切换后）：会话类方法（switchSession/newSession/fork/clone/navigateTree）返回 `code 1` 错误"会话控制能力已失效：请在 TUI 重跑 /web 恢复"。

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

## 7. 前端（已确认，2025-08 重构为 React 栈；2026 v-next 气泡聚合）

- **技术栈**：React 19 + Vite 8 + TypeScript strict + Tailwind v4（CSS-first，`@import "tailwindcss"`）+ shadcn（new-york 风格 / zinc 基色 / CSS variables 暗色主题，`<html class="dark">`）；图标 lucide-react；无路由（单页）。
- **工程位置**：`packages/pi-web/web/` 子工作区（`pi-web-frontend`，private），独立 `package.json`/`vite.config.ts`；构建产物 `web/dist/`。
  - 构建：`npm run build:web`（根）/ `npm run build -w pi-web-frontend`；`npm publish` 时 `prepublishOnly` 先构建（`cd web && npm run build`）。
  - **`web/dist` 提交进 git**（个人仓库开箱即用）；`/web` 启动前检查 `dist/index.html` 存在，缺失则报错提示先构建。
- **布局**：header（连接状态 / 会话名 / 模型 / 思考等级 / **上下文占用条（可点击 → Popover 上下文占用面板，含 compact 按钮）**）+ chat 流 + 侧栏（**会话列表：可点击切换 + 顶部新建按钮 + 每项工具栏（删除/重命名/查看树/复制）**、模型选择、思考等级、状态桥接面板）+ 输入区（**无左侧 "+" 按钮**）。
- **气泡渲染（R16，ChatGPT 式；R17 修订；R18 langgraph 流式模型）**：**气泡最终只显示最终回复文本**（`finish_reason:stop` 后所有 ReAct 中间态消失）；多轮循环（r→a→r→a→f）中，**气泡内只实时展示当前活跃轮（LLMNode）的内容，轮边界清空重来**：
  - **流式中（当前活跃 turn 未 final）**，按 langgraph GraphNode 心智展示该轮实时内容：
    - **reasoning**：偏灰色小字（`text-muted-foreground`），thinking 全文实时流出（非占位行、不折叠）
    - **content**：与终态一致——**Markdown 实时流式渲染** + 尾部 ▍ 光标（markdown 未闭合块容错）
    - **ToolNode**（工具卡片，接在 content 后面）：状态图标（运行中 spinner / 完成 ✓ / 失败 ✗）+ 工具名 + 输出预览截断，**点击就地展开** args/output（执行中实时更新 output）——与 progress 弹窗内 tool 行同款组件
  - **轮边界**：新 turn（下一轮 LLMNode）开始 → 上一轮 reasoning/content/tool 全部清空，开始显示新一轮内容；**已 final 的中间 turn 终态前后都不渲染任何内容**
  - **终态（所有 turn final）**：气泡只留**最后一个 turn 的最终文本**（Markdown 渲染；中间 turn 的正文一律隐藏）；progress 按钮出现
  - **工具栏**（仅终态出现，流式中不显示）：fork + **progress**（点击 → progress 弹窗）
- **progress 弹窗（R18 重构，单 scroll ReAct 流）**：终态后查看完整 ReAct 流程：
  - **总体单 scroll**：弹窗内容区一个 overflow-y-auto，内部**不嵌套**任何二级 scroll（无内外双 scroll）
  - **数据 = Turn.steps**（turn 内 content/reasoning/tool 按序交错，`message_end` 从 content 块序列重建；history 回填合成近似 steps）
  - **content**：正常展示（不折叠），Markdown 渲染，与正文同款
  - **reasoning**：折叠，默认只显示 "reasoning" 标签，点击**就地展开**全文（pre 纯文本）
  - **tool**：折叠，显示摘要行（状态图标 + 工具名 + 输出预览截断），点击**就地展开** args/output——与气泡流式中 ToolNode 卡片同款
  - 不含最终正文（正文在气泡里）；turn 之间按序展示（多轮交错）
- **输入区（R16，ChatGPT 式上拉框；R17 修订；R18 触发规则扩展 + IME 加固）**：contenteditable 容器（现状保留）：
  - **触发规则（R18）**：**输入框行首（光标前无任何内容）按 `/` 或 `@` 直接触发**（首个 `/` `@`），**任意位置 `' /'` 或 `' @'` 触发**（空格可为 nbsp）；其余情况不触发
  - **触发面板**：`/` → skills（**显示 `skill:<name>`**，插入 chip `/skill:<name>`）+ 命令（`pi:listCommands`，插入纯文本 `/name`）；`@` → 工作目录文件**与文件夹**（`pi:listFiles` 含目录条目 `isDir`，目录/文件平级混列，插入 chip 路径）
  - 触发字符（行首 `/` `@` / 空格+斜杠 / 空格+@）在选中时被**替换**为插入内容；Esc 取消则字符原样保留
  - **IME 加固（R18）**：query 以 `onInput` 从编辑器 DOM 反推（光标前最近触发序列之后到光标的文本）为准，与 keydown 累积双轨——中文输入法组词上屏（compositionend）也能实时筛选
  - 键盘：上下键切换、回车选中（面板打开时回车不发送）、Esc 取消、继续输入实时过滤（包含匹配）、鼠标点击可选中；面板从输入框上方弹出
  - **可见窗口 8 行**：选项超过 8 个时列表滚动，上下键导航高亮行自动滚入视野（scrollIntoView block:nearest）
  - **发送/abort 融合**：输入区右侧单一圆形 icon 按钮——空闲 `↑`（发送）、LLM 运行中 `■`（abort，点击直接停止）；busy 时的"agent 忙碌 + 队列 + deliverAs 选择器"行**删除**（steer 能力移除）
  - **队列**：LLM 运行时回车 = followUp 入队；输入区上方轻提示条"已排队 ×N"；消息流中的队列 marker 删除
- **轮次聚合（v-next）**：聊天流按**气泡**渲染——每条 user 消息开启新气泡，到下一条 user 消息前的全部内容聚合进同一气泡（工具循环的多个 assistant turn、thinking、toolcall、toolResult 均在内）。
  - 气泡 = `{userText, userIndex, turns: [{text, thinking, toolCallIds, steps, final, startedAt?, endedAt?}]}`；`userIndex`（第几条 user 消息，0-based）由后端在 `pi:getMessages` 标记，流式消息由前端自增计数——**fork 即发 `pi:fork {userIndex}`**。**`steps`（R18）**：turn 内 ReAct 步骤序列 `[{type: "content"|“reasoning”|“tool”, text?, toolCallId?}]`，`message_end` 从 content 块序列（text/thinking/toolCall 按序）重建，history 回填由 text/thinking/toolCalls 合成——progress 弹窗数据源。
  - 气泡底部**工具栏**（轮结束后出现，即无活跃 turn 且 agent 空闲）：fork（分叉该轮）+ **progress**（点击 → 时间线弹窗：全部 thinking + Action 交错流程）。
  - 流式中气泡实时更新（thinking / 文本累积）；`turn_end` / `agent_settled` 驱动轮次边界与工具栏显隐。
- **交互升级（v2 重构）**：thinking 与工具输出**可展开/收起**（工具输出折叠态截断 ~1200 字符）；**跟随滚动开关**（上翻暂停自动滚动，出现"回到底部"按钮）；输入框为多行 `Textarea`（Enter 发送 / Shift+Enter 换行）；**断线横幅** + 指数退避重连（≤10s）。
- **上下文占用面板（v-next）**：点击 header 占用条 → `Popover`（`@radix-ui/react-popover`），每次展开重新拉取 `pi:getContextBreakdown`：总览（估算 total / contextWindow / 实时 percent）+ 五类行（标签 + 细进度条 + tokens + 百分比，比例相对面板内部 total，与 /status 口径一致）+ 对话细分（user/assistant/toolResult/other，比例相对 conversation.total）+ **底部 compact 通栏按钮**（原 header 图标按钮移除）。数据源非特权，无降级问题；失败显示错误 + 重试。
- **输入框标签化（v2 打磨）**：输入区为 contenteditable 容器；"+" 弹层插入的内容渲染为原子 chip（`contenteditable=false` span，`data-insert` 存插入文本；skill ✨ 紫 / file 📄 蓝），无 × 按钮，Backspace/Delete 整块删除（浏览器原生）；Enter 发送 / Shift+Enter 换行 / 中文组词回车不发送（`nativeEvent.isComposing`）/ 粘贴转纯文本；发送时按 DOM 顺序序列化（`web/src/lib/chip-serialize.ts`：chip 还原为插入文本、`<br>` 为 `\n`）。**R16：输入框必须为 block 布局（非 flex）**——Chrome caret 导航在 flex 容器内无法跨过 contenteditable=false 的原子 chip（2026-08 实测），chip 才能被光标跨过/自由组合。
- **会话控制 UI（v-next）**：点击会话列表项 = `pi:switchSession`（当前项高亮）；顶部"新建"按钮 = `pi:newSession`；每项工具栏：删除（`pi:deleteSession` + 确认弹窗，当前会话禁用）、重命名（`pi:setSessionName` + 输入弹窗）、查看树（`pi:getTree` 树弹窗，点击节点 → 确认 → `pi:navigateTree`）、复制（`pi:clone`）。
- **降级提示（v-next）**：特权操作失败（code 1 "会话控制能力已失效"）→ toast；侧栏会话区常驻提示条"会话操作需在 TUI 重跑 /web 恢复"（仅特权能力缺失时显示）。
- **状态管理**：单 `useReducer` 根 store；WS 事件流 → reducer action（`web/src/lib/stream.ts` 纯 reducer，单测覆盖）。
- **模块**：`web/src/lib/rpc.ts`（WS 客户端）/ `stream.ts`（reducer）/ `types.ts`（协议类型镜像）/ `components/`（Header/Chat/Sidebar/InputBar/DisconnectBanner/PlusPicker/TreeDialog/SessionItem）+ `components/ui/`（shadcn）。
- **加载历史**：连接建立后调 `pi:getMessages` 回填（含 thinking / toolCalls / userIndex，刷新后详情弹窗数据完整）。
- **渲染策略**：`message_*` 增量更新气泡；`state` 事件更新侧栏/头部；无虚拟滚动（限制，文档注明）。

## 8. 状态快照口径

- 上下文占用：`ctx.getContextUsage()` 的 `tokens` / `contextWindow` / `percent`（0-100 百分数，**边界归一化为 0-1 比例**再入协议，与 pi-status 口径一致）；`tokens` 为 null → 前端显示"待更新"。
- 会话信息：`ctx.sessionManager.getSessionFile()` / `getSessionId()`；名称用 `pi.getSessionName()`。
- 模型：`ctx.model`（id/provider/name）；思考等级 `pi.getThinkingLevel()`。
- busy：以 `agent_start/end/settled` 聚合（与 `ctx.isIdle()` 在事件点采样，二者不一致时以事件为准，SPEC 注明）。
- 触发 `state` 推送的事件点见 §4.2 表；客户端也可主动 `pi:getState` 拉全量。

## 9. 已知限制与上游建议

- **无法从 web 执行扩展命令**（含 prompt 模板 / skill 命令）：`sendUserMessage` 硬编码 `expandPromptTemplates: false`（上游有意为之，防止扩展触发命令）；`_tryExecuteExtensionCommand` 私有；RPC 模式 `prompt` 默认执行命令但那是独立进程。**建议上游**：`pi.sendUserMessage` 增加 `expandPromptTemplates` 选项（默认 false 不变），或暴露 `executeCommand(name, args)`——合入后 pi-web 一行改动即可解锁扩展命令执行。当前策略：命令面板不展示不可执行的命令。
- **TUI 手动切换会话后特权命令降级**：`/web` handler 捕获的 `ExtensionCommandContext` 在会话替换后失效（`runner.assertActive` 抛错），`withSession` 续链仅覆盖 web 端发起的切换；TUI 里跑 `/resume` `/new` 后，web 端 resume/new/fork/clone/tree 不可用，需 TUI 重跑 `/web` 恢复。非特权能力（发消息/模型/思考等级/列表/删除/重命名/树查看）经 factory 重跑自动恢复。
- **看不到内置 picker 的选项列表**（如 `/session`、`/model` 的 TUI 选择器）：内置命令绕过扩展系统；web 端等价能力为 §4.4 重新实现（列表可看可操作）。
- **删除会话无官方 API**：fs unlink 直删 jsonl 文件（仅非当前会话）；上游若提供 `SessionManager.deleteSession` 可替换。
- **ctx 生命周期**：session_start 捕获的 ctx 在会话内有效；切换间隙 `state.ctx` 置空，WS 请求返回 `code 3 会话未就绪`，客户端重试即可。捕获的 pi / command ctx 在会话替换后抛错（错误含 `stale`，server 层映射 code 3）。
- **`/reload` 或切到不同 cwd 的会话**会清空扩展模块缓存 → 模块状态丢失；`session_shutdown(reason=reload)` 已关闭服务，重跑 `/web` 即可。
- **fork 的 entryId 对齐**：message 事件不携带 entry id，pi-web 用"user 消息序号（userIndex）→ `getEntries()` 第 N 条 user 消息"解析；若会话被外部修改（如 TUI 里手动编辑/重放）导致序号漂移，fork 可能指向不同消息——可接受（个人工具）。

## 10. 模块划分（src 纯函数层全部 TDD；index.ts 薄接线层不做单测）

| 文件 | 职责 | 类型 |
|---|---|---|
| `src/index.ts` | 薄接线：`registerCommand("web")`、参数解析、服务启停、`pi.on` 订阅→广播（含 60ms 合并节流）、WS 方法→ctx/api 调用、**特权 ctx 捕获链**、ctx.ui 桥接包装、平台浏览器打开 | 薄层（无单测） |
| `src/args.ts` | `/web` 参数解析纯函数 | 纯函数（TDD） |
| `src/protocol.ts` | JSON-RPC 编解码：请求/响应/notification 构造与解析、id 校验、错误对象 | 纯函数（TDD） |
| `src/coalescer.ts` | 流式合并节流器（批收集、flush、flushNow、超时） | 纯函数/可注入时钟（TDD） |
| `src/events.ts` | pi 事件 → 协议事件映射（纯：输入事件对象 + 状态采样 → 输出 notification 载荷） | 纯函数（TDD） |
| `src/state.ts` | `pi:getState` 快照 + `state` 事件载荷构造（归一化 percent、缺省处理） | 纯函数（TDD） |
| `src/http-util.ts` | MIME 映射 / 路径穿越防护 / token 比对与提取 / message 内容提取（纯函数，供 server 使用） | 纯函数（TDD） |
| `src/fork-util.ts` | userIndex → entryId 解析（`getEntries()` 按序数第 N 条 user 消息）、stale 错误判定 | 纯函数（TDD） |
| `src/session-files.ts` | 删除会话校验（路径在 session 目录内 / .jsonl / 非当前）与 unlink | 纯函数 + fs（TDD） |
| `src/file-lister.ts` | 工作目录文件扫描：gitignore（ignore 包）/ 深度 / 上限 / 分组 | 纯函数 + fs（TDD） |
| `src/server.ts` | node:http + ws 组装、token 校验、静态文件路由、连接管理、JSON-RPC 派发 | 薄层（可测逻辑下沉 http-util/protocol） |
| `web/` | 前端（React 工程，见 §7） | — |

### 10.1 测试策略
- 纯函数层（args/protocol/coalescer/events/state）：vitest 单测全覆盖边界（空输入、坏 JSON、非法端口、超时 flush、token 不匹配等）。
- `server.ts` 仅薄层；路由/token 判定等可测逻辑下沉纯函数。
- `index.ts` 不做单测；端到端靠手动验证（T6）。
