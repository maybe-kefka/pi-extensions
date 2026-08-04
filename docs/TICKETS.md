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
