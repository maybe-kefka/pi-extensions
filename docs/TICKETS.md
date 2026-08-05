# TICKETS — @kefka/pi-web

流程：SPEC → tickets → TDD。每个功能 ticket 先写失败测试（红），再实现（绿），最后 typecheck + 全量测试通过后 commit。`src/index.ts` 为薄接线层，不做单测。

## 实现中发现的偏差（2025-08-03，已同步 SPEC §1.4 / §9）

- **`pi:switchSession` / `pi:newSession` 不可实现**：源码核实 `newSession/fork/navigateTree/switchSession/waitForIdle/reload` 只存在于 `ExtensionCommandContext`（`runner.createCommandContext()`），事件 ctx（`createContext()`）与 `ExtensionAPI` 均不含；扩展无命令派发入口。实现为返回明确错误 + 提示 TUI `/resume`/`/new`；前端会话列表只读展示。E2E 已验证该错误路径。

## R9 前端重构（React + Vite + Tailwind + shadcn）✅ 2025-08-03

用户要求页面重构（不再 vanilla）。逐题对齐后执行：
- `packages/pi-web/web/` 子工作区 `pi-web-frontend`（private）：React 19 + Vite 8 + TS strict + Tailwind v4（CSS-first）+ shadcn 手写经典组件（new-york/zinc/radix，CLI 新版交互式预设无法非 TTY 落地 → 手写等价源码）；lucide-react；无路由；暗色主题
- 组件：Button/Input/Textarea/Select/Card/Badge/Progress/ScrollArea/Separator/Tooltip/Sonner（`components/ui/`）；App 层 Header/Chat/Sidebar/InputBar/DisconnectBanner
- 状态：`useReducer` 根 store + `web/src/lib/stream.ts` 纯 reducer（+20 单测，含 history 回填 action）；`rpc.ts` WS 客户端（重连退避、请求映射、事件订阅）；`types.ts` 协议镜像
- 交互升级：thinking/工具输出可展开、跟随滚动开关（上翻暂停+回到底部按钮）、Textarea（Enter/Shift+Enter）、断线横幅
- 扩展侧：`WEB_DIR → web/dist`（启动前检查 dist 存在）；**cookie 授权**（`piweb` HttpOnly SameSite=Strict，修复子资源 403 白屏隐患——浏览器子资源不携带页面 query token）；新增 `pi:getMessages`（页面加载回填历史）；`files: ["src","web/dist"]`；prepublishOnly 先构建
- 构建：`npm run build:web`（root）/ `build -w pi-web-frontend`；`web/dist` 提交进 git
- 验证：`npm test` 147 全绿；`npm run typecheck` 全 workspace 通过；E2E 主套件 19 项 + 生命周期 9 项全过（含 React #root、assets 带 cookie 200 / 无 cookie 403、getMessages）

## T0 包骨架 ✅
- npm workspaces 下新增 `@kefka/pi-web`：`packages/pi-web/`（package.json / tsconfig.json / src/ / test/ / web/）
- package.json：运行时依赖 `ws`（dependencies）；`@earendil-works/pi-coding-agent` + `@types/ws` 仅 devDependencies；peerDependencies 声明 `@earendil-works/pi-coding-agent`（SessionManager 值导入，由 pi 宿主经 jiti 别名提供）；`pi.extensions` 入口 `./src/index.ts`；scripts 对齐 pi-status（typecheck / test / prepublishOnly）
- 根 `.pi/settings.json` 追加 pi-web 入口（绝对路径）；根 package.json 追加 `publish:pi-web`
- 验收：`npm install` 成功；`npm run typecheck -w @kefka/pi-web` 通过；vitest 可跑 ✅

## T1 args.ts（/web 参数解析）✅
文件：`src/args.ts` + `test/args.test.ts`（9 tests）
验收（SPEC §2.1）：
- `--port <n>` / `--port=<n>` / `-p <n>` 解析正确；缺省 → 随机（0）
- `--port 0` → 随机；非数字 → 错误；负数/超范围（>65535）→ 错误
- `--open` / `--stop` 布尔
- 未知参数 → 错误 + 用法字符串
- 空参数 → 缺省对象
- 返回结构化 `ParseResult`（`{ok, value | error}`），错误信息人类可读中文

## T2 protocol.ts + http-util.ts（JSON-RPC 编解码 + HTTP 工具）✅
文件：`src/protocol.ts` + `test/protocol.test.ts`（14 tests）；`src/http-util.ts` + `test/http-util.test.ts`（10 tests）
验收（SPEC §4.1）：
- `parseMessage(json)`：非法 JSON / 非对象 / 缺字段 → 结构错误（区分"解析失败"与"业务错误"）
- 请求：`{jsonrpc:"2.0", id, method, params}` → 识别为 request；`params` 缺省 → `{}`
- notification（服务器→客户端）：`method: "pi:event"` 无 id → 识别为 notification
- `makeResponse(id, result)` / `makeError(id, code, message)` / `makeEvent(type, payload)` 载荷形状正确
- id 保持原样（string | number）；`jsonrpc` 字段非 "2.0" → 错误

## T3 coalescer.ts（流式合并节流）✅
文件：`src/coalescer.ts` + `test/coalescer.test.ts`（8 tests）
验收（SPEC §4.2）：
- 事件入队 → 到 flush 间隔批量吐出（可注入时钟/手动 tick，不用真计时器）
- `flushNow()` 立即吐出全部（对应 `message_end` / `tool_execution_end`）
- 空队列 flush → 空数组，不崩溃
- 顺序保持（FIFO）
- 容量上限（如 1000 条）防御

## T4 events.ts（pi 事件 → 协议事件映射）✅
文件：`src/events.ts` + `test/events.test.ts`（12 tests）
- `message_update` 只透传 `assistantMessageEvent`（含 partial），裁剪整份 message/usage
验收（SPEC §4.2）：
- `mapEvent(type, payload)`：`message_start/update/end`、`tool_execution_*`、`agent_*`、`queue_update` 等输入对象 → `{type, ...}` 输出载荷
- `message_update` 载荷裁剪（只带 delta/partial 必要字段，避免全量 message 重复轰炸——合并节流已防频率，字段裁剪防体积）
- `session_before_switch` / `session_shutdown` / `session_start` → 对应事件 + 附 `state` 采样标记
- `notify` / `setStatus` / `setWidget` 桥接载荷（SPEC §4.3）
- 未知/未订阅事件 → 丢弃

## T5 state.ts（状态快照）✅
文件：`src/state.ts` + `test/state.test.ts`（7 tests）
验收（SPEC §8）：
- `buildState(input)`：会话文件/id/名、模型（provider/id/name）、思考等级、上下文占用（**percent 0-100 → 0-1 归一化**）、isStreaming、messageCount
- `getContextUsage()` 为 undefined / tokens 为 null → 对应字段 `null`，前端"待更新"
- 空会话 / 无模型 边界
- `state` 事件载荷与 `pi:getState` 响应同构（同一构造函数）

## T6 端到端验证 ✅（RPC 模式冒烟，22 项断言）
- `pi --mode rpc --no-session --extension packages/pi-web/src/index.ts` + `/web --port 8765`：
  - HTTP：带 token 200 / 无 token 403 / 路径穿越 404 / app.js 200
  - WS：`pi:getState`（context.percent 存在）、`pi:listSessions`（数组）、`pi:listCommands`（含 /web）、未知方法 -32601、`pi:switchSession` 返回已知限制错误、空 text -32602
- 生命周期：默认随机端口 / 重复 `/web` 只打印 URL / 不同 `--port` 提示先 stop / `--stop` 优雅关闭 / 停止后可重启 / 未运行 `--stop` 提示
- 手动 TUI 全流程（真浏览器交互）留待使用阶段验证

## T7 前端页面（web/）✅（静态已就绪，浏览器交互待使用阶段验证）
文件：`web/index.html` + `web/app.js` + `web/styles.css`
- WS 连接（token 从 URL 取）+ 断线重连（指数退避 ≤10s）；JSON-RPC 请求/事件派发
- 聊天流：`message_*` 增量渲染、thinking 折叠、工具执行行（start/update/end）
- 侧栏：会话列表（只读 + 提示 TUI 切换）、模型选择、思考等级、命令列表（只读）、状态桥接面板（notify/setStatus/setWidget）、上下文占用条
- 发送区：idle 直接发；忙碌时投递选择（默认 followUp / 可切 steer）；abort 按钮

## T8 收尾 ✅
- SPEC §1.3/§1.4/§4.4/§9 已同步实现中发现的会话控制限制；README 已写
- `npm test`（127 tests 全绿）+ `npm run typecheck`（全部 workspace）通过；E2E 22 项断言通过；commit

## T9 前端重构轮 ✅
- T9.1 React+Vite+Tailwind+shadcn 重构（commit 7d66be7）；`npm run build:web` → `web/dist` 提交
- T9.2 Cookie 授权（HttpOnly SameSite=Strict + `/assets` 子资源自动带 cookie；`/ws` 仍显式 token）
- T9.3 响应式：<1024px 侧栏收进 Sheet 抽屉、≥1024px 可折叠侧栏、chat `max-w-3xl` 居中、safe-area/虚拟键盘适配（commit 19b28e5）
- T9.4 思考等级随模型过滤：`availableThinkingLevels` 入 `pi:getState`/`state`（commit 071feb9）
- T9.5 QQ 风格气泡 + 工具弹窗（commit e6df297）
- T9.6 双 skill（shadcn + Vercel React）审查修复：迁移官方 chat 原语（message-scroller/message/bubble/marker + avatar/empty，`@shadcn/react` 依赖）、`wrap-break-word`/`scroll-fade-b`/`scrollbar-*` 工具类、`--success`/`--warning` 语义色、SelectGroup、图标 data-icon、`space-y`→`gap`、memo+useCallback 重渲染优化
- T9.7 实机复现修 bug：avatar 对齐（Message children 顺序 [Avatar,Content]）、MessageGroup 合并连续同角色（工具循环多段输出视觉连贯）、`pi:getMessages` 返回 thinking（刷新后思考块不丢）；新增 jsdom 渲染测试（Chat.test.tsx 5 例）+ 根 vitest.config.ts（别名/jsdom 环境）
- T9.8 空气泡消除：纯工具调用消息（content 仅 toolCall/thinking，无 text）不再渲染空气泡；工具卡片从底部独立列表改为**穿插到发起调用的 assistant 消息内**（message_end 提取 toolCallIds → 匹配实时 tools 行）；`textOfContent` 过滤空块
- T9.9 数据层筛除空消息 + 历史工具数据：
  - `pi:getMessages` 提取 toolCalls（assistant content 的 toolCall 块 + 按 toolCallId 配对 toolResult 结果），服务端直接筛掉空消息（无 text/thinking/toolCalls）
  - 前端 `history` 构建 tools 列表 + 消息 toolCallIds；`message_end` 空消息（无 text/thinking/工具）从 state 移除；渲染层兜底整行不渲染
  - http-util 抽 messageToolCalls/messageTextOf/messageThinkingOf 纯函数（+5 测试）
- T9.10 markdown 渲染：
  - 新 `ui/markdown.tsx`：react-markdown@10 + remark-gfm + rehype-highlight（官方同款底层），Suspense 边界、链接新标签打开、代码块（语言标签+复制按钮+hljs 透传 class）
  - index.css：`.markdown-body` 排版（标题/列表/表格/引用/任务列表）+ github-dark 主题（highlight.js@11 升级）
  - Chat.tsx：assistant 定稿后渲染 markdown，流式中保持纯文本（防未闭合语法闪烁）；user/thinking/工具输出不渲染
  - 测试：markdown.test.tsx 8 例（jsdom + jest-dom + cleanup）；踩坑：react-markdown v10 默认导出为同步 Markdown、CodeBlock children 为高亮元素需 nodeText 递归提取、CLI 单跑路径不匹配 environmentMatchGlobs

## R10 命令派发 + 轮次聚合 + "+" 弹层（2026 v-next，全部完成后 commit）

> 决策记录（2026-02 与用户逐题对齐）：
> - 只做内置可派发命令；扩展命令/prompt 模板/skill 命令**不展示不派发**（0.83.0 无公开执行 API）
> - 特权 ctx 捕获链：`/web` handler 捕获 `ExtensionCommandContext` + `withSession` 续链；TUI 手动切换后特权命令降级（toast + 侧栏提示条，需 TUI 重跑 /web）
> - `/reload` `/quit` 不派发；TUI-only 命令（export/import/share/copy/login/logout/settings/trust/changelog/hotkeys 等）不展示
> - 删除会话：fs unlink（仅非当前会话 + 确认弹窗）；重命名 setSessionName；compact 放 header 无确认；无 `/` 补全
> - 气泡 = user 消息开新气泡，下一条 user 前全部内容聚合（含多 turn 工具循环）；工具栏（fork/reasoning/tools 弹窗）轮结束后出现
> - "+" 弹层：可搜索、分块（全部 skills + 工作目录文件）；点击插入文本不发送；文件递归 3 层、gitignore 排除（`ignore` 依赖）、上限 200、按目录分组
> - 树弹窗：查看 + 点击节点确认导航；历史回填协议升级（getMessages 带 thinking/toolCalls/userIndex）

### R10.1 fork-util.ts（userIndex → entryId + stale 判定）✅
文件：`src/fork-util.ts` + `test/fork-util.test.ts`
- `resolveUserEntryId(entries, userIndex)`：按顺序数 `type === "message" && role === "user"` 的 entry，第 N 条（0-based）返回其 id；越界 → null
- `isStaleError(err)`：错误消息含 "stale" → true（server 映射 code 3）
- 输入防御：非 message entry / 非 user 跳过；空 entries → null

### R10.2 session-files.ts（删除会话校验 + unlink）✅
文件：`src/session-files.ts` + `test/session-files.test.ts`
- `validateDeletableSession(sessionDir, path, currentSessionFile)`：纯校验——绝对路径解析后在 sessionDir 内、扩展名 `.jsonl`、非当前会话 → `{ok: true} | {ok: false, error}`
- `deleteSessionFile(sessionDir, path, currentSessionFile)`：校验通过 → `fs.unlink`；失败返回错误（不 throw）
- 边界：路径穿越（`../`）、非 jsonl、当前会话、空路径

### R10.3 file-lister.ts（gitignore 文件列表）✅
文件：`src/file-lister.ts` + `test/file-lister.test.ts`
- `listFiles(cwd, opts)`：递归扫描（默认 `maxDepth: 3`、`limit: 200`）
- gitignore 排除：`ignore` 包，读根 `.gitignore` + 逐层嵌套 `.gitignore`；内置兜底排除 `.git/` 与 `node_modules/`（目录遍历跳过）
- 只列文件（不列目录本身）；按目录分组 → `{groups: [{dir, files: [{name, path}]}]}`；`path` 为相对 cwd 的路径
- 上限截断（组内截断 + 全局截断）；深度越界跳过；空目录/无文件 → 空数组

### R10.4 events.ts（turn 事件映射 + 回归）✅
- `mapEvent` 增加 `turn_start`（透传 turnIndex/timestamp）、`turn_end`（透传 turnIndex/message/toolResults）
- 现有 12 测试保持全绿

### R10.5 index.ts 接线（特权 ctx 捕获链 + 新 RPC）✅
- 模块级 `state.privileged: ExtensionCommandContext | null`；`/web` handler 捕获；`withSession` 回调续链
- WS 请求统一"最新捕获"：api（factory 重跑重绑）/ ctx（session_start 重绑）/ privileged
- 新 RPC：`pi:switchSession` `pi:newSession` `pi:fork {userIndex}` `pi:clone` `pi:navigateTree` `pi:getTree` `pi:deleteSession` `pi:setSessionName` `pi:listSkills`
- 特权缺失/失效 → `code 1` 错误"会话控制能力已失效：请在 TUI 重跑 /web 恢复"
- `pi:getMessages` 升级：assistant 带 thinking/toolCalls（含结果配对）+ user 消息带 userIndex
- `pi:listCommands` 保留（前端不再使用；仅兼容）
- `pi:listFiles`：file-lister 接线（limit 200 / maxDepth 3 默认）
- BROADCAST_EVENT_TYPES 增加 turn_start/turn_end
- 薄层原则：纯逻辑（fork 解析/删除校验/列表）全部在 R10.1-10.3

### R11 前端 reducer 重构（气泡聚合）✅
文件：`web/src/lib/stream.ts` + `web/src/lib/stream.test.ts`
- 新数据模型：`bubbles: TurnBubble[]`（`{id, userIndex, userText, userFinal, turns: Turn[], streaming}`；`Turn = {text, thinking, toolCallIds, final}`）
- actions：`history`（按 userIndex 分组构建气泡）、`message_start/update/end`（user → 新气泡；assistant → 当前/新气泡的活跃 turn）、`turn_start/turn_end`（turn_end 兜底 final 化活跃 turn）、`agent_start/end/settled`（bubble streaming 状态）、`tool_*`（全局 tools 不变）、`session_start`（清空）
- 流式 user 消息 userIndex = history 计数续接；`currentUserIndex` 入 state
- 保留 toggle_thinking / bridge / conn 等既有 action
- 测试：历史回填分组、流式 user 开新气泡、多 turn 聚合、turn_end 兜底、空消息筛除、session 切换清空

### R12 前端组件（气泡工具栏 / 会话工具栏 / 弹窗 / "+" 弹层）✅
- `web/src/components/Chat.tsx`：气泡渲染（userText + turns 文本流 + 工具栏）；工具栏在轮结束（bubble 非 streaming 且有 userText）显示：fork（`pi:fork {userIndex}`）/ reasoning（弹窗全 thinking）/ tools（弹窗聚合工具卡片，复用 ToolCard 逻辑）
- `web/src/components/SessionList.tsx`：列表项 = 点击切换 + 工具栏（删除/重命名/树/复制）；当前项高亮；顶部"新建"按钮；降级提示条（特权缺失时）
- `web/src/components/TreeDialog.tsx`：`pi:getTree` 树渲染（节点摘要截断 + 类型图标 + label + 当前 leaf 高亮）；点击节点 → 确认 → `pi:navigateTree`
- `web/src/components/PlusPicker.tsx`：输入框最左 "+" → Popover + 搜索框 + 分块（skills：`pi:listSkills` 点击插入 `/skill:<name>`；文件：`pi:listFiles` 分组点击插入相对路径）
- `web/src/components/InputBar.tsx`：加 "+" 按钮 + 光标插入逻辑
- `web/src/components/Header.tsx`：compact 按钮
- `web/src/App.tsx`：新 RPC 接线（switchSession/newSession/fork/clone/navigateTree/deleteSession/setSessionName/getTree/listFiles/listSkills）、删除确认/重命名弹窗、toast 错误（特权失效提示）、删除/重命名后刷新会话列表
- `web/src/lib/types.ts`：协议类型镜像更新（TurnBubble 相关 RPC 类型、SessionInfo 不变）
- 测试：Chat.test.tsx 更新（气泡渲染 + 工具栏显隐）；新增 PlusPicker/TreeDialog 基础渲染测试（jsdom）

### R13 收尾 ✅
- 根 workspace 安装 `ignore` 依赖（pi-web dependencies）
- `npm test` + `npm run typecheck` 全绿；`npm run build:web` → `web/dist` 提交
- README 更新（新能力简述）
- E2E 冒烟（RPC 模式）：`pi:switchSession`（有效 path 切换 / 特权缺失错误路径）、`pi:getTree`、`pi:listFiles`（gitignore 过滤）、`pi:deleteSession`（当前会话拒绝 / 非当前删除成功）、`pi:fork` 越界 userIndex 错误
- commit（SPEC §1.3/§1.4/§1.5/§3.1/§4.2/§4.4/§7/§9/§10 已同步）

## R14 UI 打磨（2026-02，用户反馈 4 项）✅

- R14.1 气泡空白行修复：根因 = 纯工具/纯 thinking turn（正文空）仍渲染 `<div class="border-t">`。渲染层过滤空 turn（无正文且非流式不渲染），分隔线只出现在有内容 turn 之间；数据层不动（thinking/toolCall 供弹窗）
- R14.2 sidebar 模型 + 思考等级合并为一个 Panel"模型 / 思考"（上下两个 Select）
- R14.3 输入框移除 placeholder
- R14.4 输入框改造为 contenteditable chip 编辑器（用户选 B）：
  - "+" 弹窗插入的内容变为原子 chip（`contenteditable=false` span，`data-insert` 存插入文本），无 × 按钮，Backspace/Delete 像删文本一样整块删除（浏览器原生行为）
  - chip 按类型区分视觉：skill ✨ 紫、file 📄 蓝；光标处插入（编辑器外追加末尾），插入后带尾随空格
  - Enter 发送 / Shift+Enter 换行；中文组词回车不发送（nativeEvent.isComposing）；粘贴转纯文本
  - 发送时按 DOM 顺序序列化：chip 还原为 data-insert、`<br>` 为 `\n`——新 `web/src/lib/chip-serialize.ts` 纯函数（+8 测试）
  - 发送按钮禁用态由 onInput/chip 插入驱动的 hasInput 状态控制
