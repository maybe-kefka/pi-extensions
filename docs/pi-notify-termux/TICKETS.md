# TICKETS — @kefka/pi-notify-termux

流程：SPEC → tickets → TDD。每个功能 ticket 先写失败测试（红），再实现（绿），最后 typecheck + 全量测试通过后 commit。`src/index.ts` 为薄接线层，不做单测。

## 实现中发现的偏差（已同步 SPEC）

- **`termux-notification-remove` 最终可用（2025-08 修订）**：此前 OPPO/Android 16 上“无效”的根因是 **Termux:API 通知权限未全开**（ColorOS 细分类别，总开关≠全开）。权限全开后 remove 实测有效（分步验证：发→确认看到→remove→确认消失）。终结反馈最终方案：扩展侧 `termux-notification-remove` + toast；替换方案（B）已删除。
- **“打开终端”需要 ColorOS “后台弹出界面”权限**：Android 10+ 后台启动 Activity 限制（termux-am 源码确认无绕过；bash 前台成功/后台被拒）。action 带 `|| termux-toast 提示` 降级。
- **`termux-notification-list` 权限全开后解锁**（能列出全部通知）→ `/notify status` 增强：显示 pi 通知实时状态（`src/notify-list.ts`，TDD 6 tests）。
- **“打开终端”不能用 `/system/bin/am`**（shell 特权工具，Android 10+ 普通 uid 调用被拒：`Permission Denial: package=com.android.shell does not belong to uid`，已实测）。改用 **Termux 自带 am 封装** `<PREFIX>/bin/am`（termux-am，app_process 以 Termux 身份执行，实测成功）。
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
- `buildOnDeleteArg({id, helperPath})` / on-delete：`<helper> cancel <id>`
- 参数数组可被 `spawn` 直接消费（无 shell 拼接）

## T3 replies.ts（文件桥编解码）✅
文件：`src/replies.ts` + `test/replies.test.ts`（8 tests）
验收（SPEC §4 / §4.2）：
- `parseFileName(name)` → `{kind, id, type}` 或 null（非法名/穿越防御）；`parseOptionSelection(text, options)` → 选项序号映射或 null（自由输入）；`decodeReply(text)`：原文透传、空输入 → cancelled 语义
- `decodeReply(text)`：原文透传（含引号/换行/`$` 不丢失）；空串 → `{status:"cancelled"}` 语义（空输入=取消，SPEC §4.1）
- id 安全：id 中路径分隔符/`..` 被拒绝（防目录穿越，helper 文件名由扩展生成，但解析侧防御）

## T4 config.ts（配置与 /notify 解析）✅
文件：`src/config.ts` + `test/config.test.ts`（9 tests）
验收（SPEC §5.3 / D10）：
- `defaultConfig`：`{enabled: true, timeoutSec: 300}`
- `buildConfigPaths(home, configDirName)`：`~/.pi/pi-notify-termux/{config.json,helper.sh,replies/}`（用传入的 `configDirName`，不硬编码 `.pi`）
- `parseConfig(raw)`：非法 JSON/缺字段 → 回退默认（逐字段校验，enabled 布尔、timeoutSec 正整数）
- `parseNotifyCommand(arg)`：`on`/`off`/空 → `{action}`；未知 → `{error}` 含用法
- `renderStatus({enabled, envOk})`：状态文案（权限无法程序化探测，permOk 分支已删）

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
- 验收：`npm run typecheck` + `npm test` 全绿（233 tests）✅；**手动验收全部通过（2025-08，OPPO/Android 16 实测）**：按钮回传+消失、Direct Reply 回传+替换为“已收到”、超时消失、滑掉 cancelled、settled 通知+注入下一轮、/notify 通知栏状态、打开终端（termux-am + 后台弹出界面权限）✅
- 备注：“这个是从”注入之谜 = 结果通知与提问通知时间戳相同易点混，注入仅结果通知路径，非 bug
- **自动消失机制（最终修订 D13）**：Direct Reply 污染仅作用于原通知实例；替换（同 id re-notify）后为新实例，remove 有效 → **替换 + 立即移除**（原 2s 展示已砍，实测替换后立即 remove 有效、时序无竞争；所有终结反馈统一直接消失）
- **权限自检（2025-08 新增）**：appops/dumpsys 无权限探测，改为行为探测：发 `--alert-once` 诊断通知 → list 确认在栏 → remove。启动 + `/notify` 时执行；权限不足弹警告（`renderPermissionHint`）。实测：权限 OK 时链路通（在栏=True）
- **⚠️ 卡死修复（用户实测报告）**：权限未开时 `termux-notification-list` 会**挂起**（termux-api 客户端等 app 响应；早期测试被 `timeout 10` 包裹掩盖了该行为）→ `spawnSync` 同步阻塞会卡死 session_start → pi 无法启动。修复：全部 spawnSync 加 `SPAWN_TIMEOUT_MS=3000`（挂起超时返回 status null → 自检返回 null 优雅降级）；启动自检延迟 1s 异步执行（不阻塞启动）。

## T7：确认引导（2025-08 新增，已完成）

- **背景**：用户要求"引导 LLM 在不确定时优先用 notify 工具与用户确认，而非自作主张"。grilling 对齐：软引导（不拦截工具）、每 turn 注入 system prompt（compaction 不丢）、英文纯指令无 few-shot、默认开、独立开关
- **TDD**：
  - `buildConfirmPrompt()`（format.ts）：断言含两工具名且 options 在前、含 3 触发词（ambiguous/reverse/missing）、含 Do NOT 反例、不含示例且 <400 字符
  - `parseConfig` 加 `confirmPrompt`（默认 true、显式 false 生效、非布尔回退默认）
  - `parseNotifyCommand` 支持 `confirm on|off` / `confirm`（无参=状态）、非法子参报错
- **接线**：`/notify confirm on|off` 持久化写入 config.json；`/notify confirm` 显示状态；`before_agent_start` 链式追加 systemPrompt
- **验证**：249 tests 全绿 + typecheck；真机待用户 reload 验收

## T8：结果通知"已读即清"（2025-08，已完成）

- **背景**：用户反馈 settled 后的结果通知在开启下一轮对话 / 切换 session / reload 后一直残留。结果通知语义 = 一次性提醒，用户回到交互后即过期
- **实现**（薄接线，index.ts）：
  - `input`：用户提交消息 → remove 结果通知
  - `agent_start`：兜底一切新 run（含 [回复] 注入消息的路径）
  - `session_shutdown`：切 session（new/resume/fork）/ reload / quit → remove
  - `session_start`：清理上次 session 残留（兜底 quit 时 remove 未发出的情况）
- **验证**：74 tests 全绿 + typecheck；真机待用户 reload 验收

## T9：终结反馈统一直接消失（2025-08，已完成）

- **背景**：用户要求 ask 通知也立刻 remove，与结果通知统一效果（都是直接消失）
- **实现**：`replaceWithStatus`（替换 + `AUTO_DISMISS_MS=2000` 延时 remove）→ `replaceAndDismiss`（替换 + **同步立即 remove**）；删除 `AUTO_DISMISS_MS` 常量与计时器
- **实弹验证**：替换 → 立即 remove → `termux-notification-list` 确认不在栏（无时序竞争）；污染实例路径（Direct Reply）真机待用户验收
- **验证**：74 tests 全绿 + typecheck

## T10：Direct Reply 截断修复（2025-08，已完成）

- **背景（用户实测报告）**：通知回复输入含空格的长内容（"测试 settled 通知效果，无需回复"）→ 扩展只收到第一段"测试"
- **根因（源码实证）**：termux-api `NotificationAPI.onReceiveReplyToNotification` 用 `action.replace("$REPLY", shellEscape(reply))` 替换，**shellEscape 自带引号**（`"` + 转义内部引号 + `"`）；扩展 action 里又写了 `"$REPLY"` → 替换后双引号嵌套 `""输入""` → `sh -c` 解析错乱，含空格输入分词，helper `$3` 只取第一段。**无空格输入恰好不触发**（`""好的""` 拼成一个词）——早期验收被掩盖
- **修复**：action 里裸写 `$REPLY`（引号由 termux-api 提供）；本地模拟 shellEscape 替换验证：含空格 42 字节完整 ✅、含双引号转义 ✅、无空格 ✅
- **已知限制**：shellEscape 只转义双引号，输入含 `$`/反引号时双引号内仍会被 shell 展开（termux-api 上游缺陷，不处理）
- **验证**：notify-cmd 13 tests 全绿 + typecheck；真机待用户复测

## T11：权限自检警告文案完善——区分"通知权限"与"通知使用权（监听服务）"（2026-08，已完成）

- **背景（用户实测报告）**：权限全开仍弹"Termux:API 通知权限未开启或未开全"。现场诊断（2026-08-05）：`termux-notification` 发送正常（exit 0，通知权限没问题），但 `termux-notification-list` 恒返回空（exit 0）——`com.termux.api` 进程不存活、监听服务未绑定。根因：list 依赖 Termux:API 的 **NotificationListenerService**（系统级「通知使用权」开关，与「通知权限」独立）；服务被杀/未绑定时 list 返回空 → 自检误判为权限未开全。用户开关切换（off→on 强制重新绑定）后恢复。
- **改动**：
  - `renderPermissionHint`（notify-list.ts）文案重写：同时提示 ① 通知权限全开（含 ColorOS 细分类别）② 通知使用权（监听服务）——列表/自检依赖它，未开或服务被杀同样触发此警告
  - README 权限表新增「Termux:API 通知使用权（监听）」行；SPEC §2 权限清单补第 3 项（原 3/4 顺延）；AGENTS.md 实测知识库同步
- **TDD**：`renderPermissionHint(false)` 断言新增 `通知使用权`；`renderPermissionHint(true)` 仍为 ""
- **验证**：`npm test` + `npm run typecheck` 全绿；真机自检恢复（用户开关切换后已实测恢复）
