# TICKETS — @kefka/pi-notify-termux

流程：SPEC → tickets → TDD。每个功能 ticket 先写失败测试（红），再实现（绿），最后 typecheck + 全量测试通过后 commit。`src/index.ts` 为薄接线层，不做单测。

## 实现中发现的偏差（已同步 SPEC §1.5）

- **CONFIG_DIR_NAME 值导入**：D10 要求不硬编码 `.pi` → 需值导入 `CONFIG_DIR_NAME` → package.json 增加 `peerDependencies: @earendil-works/pi-coding-agent`（照 pi-web 先例，宿主 jiti 别名提供）。
- **typebox 依赖**：tool 参数 schema 需 TypeBox → devDependency `typebox@^1.3.7`（对齐宿主版本；运行时由 pi 加载器别名到打包版）。
- **checkTimeout 幂等语义**：超时后轮询重复检查稳定返回同一 timeout 结果（而非首次后返回 null），已终结（answered/cancelled）才返回 null。

## T0 包骨架 ✅
- npm workspaces 下新增 `@kefka/pi-notify-termux`：`packages/pi-notify-termux/`（package.json / tsconfig.json / src/ / test/）
- package.json：运行时**零依赖**（仅 Node 内置）；`@earendil-works/pi-coding-agent` devDependencies（类型导入）+ peerDependencies（CONFIG_DIR_NAME 值导入）；`typebox` devDependency（tool schema）；`pi.extensions` 入口 `./src/index.ts`；scripts 对齐 pi-status（typecheck / test / prepublishOnly）
- 根 `vitest.config.ts` include 追加 `packages/pi-notify-termux/test/*.test.ts`；根 `.pi/settings.json` 追加入口（绝对路径）；根 package.json 追加 `publish:pi-notify-termux`
- 验收：`npm install` 成功；`npm run typecheck -w @kefka/pi-notify-termux` 通过；vitest 可跑 ✅

## T1 format.ts（通知文案格式化）✅
文件：`src/format.ts` + `test/format.test.ts`（8 tests）
验收（SPEC §4）：
- `buildTitle(kind, date)`：`result` → `✅ pi · HH:MM`；`ask` → `❓ pi 提问 · HH:MM`（HH:MM 两位补零）
- `buildContent(kind, ...)`：需求 1 内容 = 最终回复原文；需求 2 内容 = 问题 + 选项列表（`1) xxx` 换行），input 无选项时仅问题
- 空文本处理：空串/纯空白 → 判定"无可通知内容"

## T2 notify-cmd.ts（termux-notification 参数构造）✅
文件：`src/notify-cmd.ts` + `test/notify-cmd.test.ts`（11 tests）
验收（SPEC §4.1）：
- `buildResultNotificationArgs({title, content, helperPath, amPath, ts})`：`--id pi-notify-result`、`--title`、`--content`、`--button1 回复` + action `<helper> notify <ts> "$REPLY"`、`--button2 打开终端` + action `<amPath> start -n com.termux/.app.TermuxActivity`；`$REPLY` 保持字面不被转义破坏
- `buildAskOptionsArgs({id, title, content, options, helperPath})`：按钮数与选项数一致（1–3），action `<helper> ask <id> N`（N 从 1）；options 0 或 >3 → 抛错
- `buildAskInputArgs({id, title, content, helperPath})`：单个 `--button1 回复` + action `<helper> ask <id> "$REPLY"`
- `buildCancelArg(id)` / on-delete：`<helper> cancel <id>`
- 参数数组可被 `spawn` 直接消费（无 shell 拼接）

## T3 replies.ts（文件桥编解码）✅
文件：`src/replies.ts` + `test/replies.test.ts`（8 tests）
验收（SPEC §4 / §4.2）：
- `encodeReplyFile(kind, id)` → `notify-<ts>.reply` / `ask-<id>.reply`；`parseReplyFile(name)` → `{kind, id}` 或 null（非法名）
- `encodeCancelFile(id)` → `ask-<id>.cancel`；识别
- `decodeReply(text)`：原文透传（含引号/换行/`$` 不丢失）；空串 → `{status:"cancelled"}` 语义（空输入=取消，SPEC §4.1）
- id 安全：id 中路径分隔符/`..` 被拒绝（防目录穿越，helper 文件名由扩展生成，但解析侧防御）

## T4 config.ts（配置与 /notify 解析）✅
文件：`src/config.ts` + `test/config.test.ts`（9 tests）
验收（SPEC §5.3 / D10）：
- `defaultConfig`：`{enabled: true, timeoutSec: 300}`
- `buildConfigPaths(home, configDirName)`：`~/.pi/pi-notify-termux/{config.json,helper.sh,replies/}`（用传入的 `configDirName`，不硬编码 `.pi`）
- `loadConfig(json)` / `parseConfig(raw)`：非法 JSON/缺字段 → 回退默认（逐字段校验，enabled 布尔、timeoutSec 正整数）
- `parseNotifyCommand(arg)`：`on`/`off`/空 → `{action}`；未知 → `{error}` 含用法
- `renderStatus({enabled, envOk, permOk})`：状态文案

## T5 ask.ts（pending 状态机）✅
文件：`src/ask.ts` + `test/ask.test.ts`（9 tests）
验收（SPEC §5.2 / D6）：
- `createAsk({id, question, timeoutMs, now})`：状态 `pending`，`deadline = now + timeoutMs`（timeoutMs=0 → 永不超时）
- `resolveAsk(ask, reply, now)` → `{status:"answered", selection, option, text}`；`cancelAsk` → `{status:"cancelled"}`；`checkTimeout(ask, now)`：过 deadline → `{status:"timeout"}`
- 结果序列化 `serializeResult`：`{status, question 回显, selection/option/text 按状态}`
- 已终结的 ask 再次 resolve/cancel → 幂等（返回原结果，不抛）

## T6 index.ts 接线（薄层，不单测）✅
- TUI 守卫：`ctx.mode !== "tui"` → 不注册任何东西（tool execute 内守卫 + session_start 事件内守卫）
- 启动：探测 `termux-notification`（`which` 一次缓存）、生成 helper.sh、清理 `replies/`、启动轮询（500ms）
- `agent_settled` → 取最终回复（agent_end 缓存最后 assistant 文本）→ 弹结果通知（enabled && 内容非空）
- 轮询：`notify-*.reply` → `sendUserMessage(text)`；`ask-<id>.reply` → resolve answered（options 按钮序号 → selection/option 映射）；`ask-<id>.cancel` → resolve cancelled；空输入 → cancelled；消费即删
- `registerTool` × 2：`notify_ask_options` / `notify_ask_input`（TypeBox schema、阻塞 + 超时 + on-delete 取消 + abort 处理，返回结构化内容 + details）
- `registerCommand("notify")`：on/off/status + 持久化 + 提示（含 Android 13+ 权限提示）
- `session_shutdown`：取消 pending、停轮询
- 验收：`npm run typecheck` + `npm test` 全绿（220 tests）✅；本机 `/reload` 后手动验收待做（SPEC §6）
