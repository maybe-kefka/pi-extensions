# SPEC — @kefka/pi-notify-termux

> 状态：已确认（2025-08 与用户 grilling 逐题对齐）
> 仓库：`~/projects/pi-extensions`（npm workspaces monorepo，包名模式 `@kefka/pi-*`）

## 1. 概述

### 1.1 目标
把 pi 的 agent 结果与交互带到 **Android 通知栏**（Termux 环境）：agent 结束后弹通知告知最终回复，并允许用户在通知里直接输入回复作为下一轮输入；同时给 LLM 提供两个 tool，用通知向用户提问（选项选择 / 自由输入）。

### 1.2 定位
- 通知通过外部命令 `termux-notification`（termux-api 包）发送——独立进程，不依赖 pi 存活。
- 通知交互（Direct Reply / 按钮）经**文件桥**回传：通知 action 是 shell 命令（干净环境、无 PATH），写入 `replies/` 目录文件；扩展轮询该目录解析回复。
- 需求 1 的回复 → `pi.sendUserMessage` 注入为下一轮用户消息；需求 2 的回复 → resolve 阻塞中的 tool 调用。

### 1.3 已确认决策（grilling 逐题对齐）

| # | 决策 | 内容 |
|---|---|---|
| D1 | ~~非 focus 才工作~~ | **已砍**（需求 3 取消）：不做前台/focus 检测（Android 10+ 无 root/adb 无法检测，已实测 dumpsys 全被拒）。通知无条件工作，靠 `/notify` 手动开关防打扰 |
| D2 | tool 提问模型 | **阻塞等待**：`execute()` await 用户回复，回复作为 tool 结果返回，LLM 继续当前推理链 |
| D3 | 需求 1 触发 | `agent_settled`（等自动重试/压缩/排队 follow-up 全部结束，`ctx.isIdle()===true`） |
| D4 | 需求 1 通知形态 | 标题 `✅ pi · HH:MM`；内容 = 最终 assistant 消息**全文**（Android 大文本样式，通知栏折叠、可展开）；按钮 `[回复]`（Direct Reply）+ `[打开终端]`；**固定 id 原地更新**（新一轮替换旧通知，不堆积） |
| D5 | 需求 2 tool 拆分 | **两个 tool**：`notify_ask_options`（question + options ≤3，每个选项一个按钮，点击即选）、`notify_ask_input`（question + Direct Reply 自由输入） |
| D6 | 超时/取消 | 默认超时 5 分钟（tool 参数 `timeout` 可覆盖，0=不超时）；**滑掉通知 = 取消**（`--on-delete` 钩子）；结构化返回 `{status: "answered" \| "timeout" \| "cancelled", ...}` |
| D7 | 总开关 | 命令 `/notify on` / `/notify off` / `/notify`（无参=显示状态）；默认 on；**持久化** |
| D8 | 模式守卫 | **仅 TUI 模式**（`ctx.mode === "tui"`）加载全部功能；print/json/rpc 模式静默不加载（无会话可注入"下一轮"，回复通道半残） |
| D9 | 命名 | 包 `@kefka/pi-notify-termux`；tool `notify_ask_options` / `notify_ask_input`；标题 `✅ pi` / `❓ pi 提问` |
| D10 | 配置 | `{enabled: boolean, timeoutSec: number}`，存 **`~/.pi/pi-notify-termux/config.json`**（用户级，用 `CONFIG_DIR_NAME` 构建，不硬编码 `.pi`） |

### 1.4 非目标
- **不做前台/focus 检测**（D1，需求 3 取消；若未来有 root，可加 "su 模式" 精确检测，检测逻辑已抽象为纯函数接口，不阻塞当前开发）。
- 非 TUI 模式（print/json/rpc）不加载任何功能（D8）。
- 不做自定义通知渠道（`termux-notification` 默认渠道即可，`--channel` 不传）。
- 不做通知历史/日志 UI、不做回复模板、不做多会话并发归属管理（session 切换时 pending ask 直接取消，见 §5.5）。
- 不打包成独立 Android app / 不依赖 Tasker。

### 1.5 依赖原则
- **运行时零 npm 依赖**：仅 Node 内置 `node:child_process` / `node:fs` / `node:path` / `node:os`；外部命令 `termux-notification`（termux-api 包，由用户 `pkg install termux-api` 提供）。
- `@earendil-works/pi-coding-agent`：**类型导入**为主（devDependency），另**值导入 `CONFIG_DIR_NAME`**（D10 要求不硬编码 `.pi`）→ 声明 peerDependencies（照 pi-web 先例，由 pi 宿主经 jiti 别名提供）。
- `typebox`：devDependency（tool 参数 schema 类型；运行时由 pi 宿主加载器别名到打包版）。
- 无其他 peerDependencies（无 pi-tui 值导入需求）。

## 2. 环境与前置

- Android + Termux；需安装 **Termux:API** app 与 `termux-api` 包（`termux-notification` / `termux-notification-list` 可用）。
- **Android 13+ 需用户在系统设置授予 Termux 通知权限**（`POST_NOTIFICATIONS`），否则通知命令静默失败——`/notify status` 与启动时提示该前置。
- 通知 action 在**干净环境**（`dash -c`）执行：PATH 丢失、`.profile` 不加载 → helper 脚本与所有命令一律**绝对路径**。
- Direct Reply 输入经 termux-api 替换 `$REPLY` 后作为参数传给 action（官方语义：`--button1-action "termux-toast \$REPLY"`）。

## 3. 架构

```
pi (TUI, 扩展进程)
 ├─ agent_settled ──► 通知[回复][打开终端] ──► 用户输入 ──► helper.sh 写 replies/notify-*.reply
 ├─ tool execute (阻塞) ──► 通知[选项×N/回复] ──► 点击/输入 ──► helper.sh 写 replies/ask-<id>.reply
 │       ▲
 │       └── 轮询循环（500ms）解析 replies/ 目录 ──► resolve / sendUserMessage
 └─ /notify on|off ──► 读写 ~/.pi/pi-notify-termux/config.json
```

- **文件桥目录**：`~/.pi/pi-notify-termux/`（用户级 pi 配置目录下，与配置同根）：
  - `config.json` —— 配置
  - `helper.sh` —— 启动时生成的回传脚本（绝对路径调用，见 §4.2）
  - `replies/` —— 回复文件（`<kind>-<id>.reply`；`<kind>` ∈ `notify` | `ask`）
- **轮询**：500ms 间隔扫描 `replies/`，解析后删除文件（消费即删）。不用 fs.watch（Termux inotify 可用但崩溃残留与并发场景下轮询更稳）。
- 通知 id：需求 1 固定 `pi-notify-result`（原地更新）；需求 2 `ask-<id>`（`<id>` 为递增/时间戳，与 pending 关联，互不覆盖）。

## 4. 模块划分（纯函数 + TDD；`src/index.ts` 薄接线）

| 模块 | 职责 | 可测性 |
|---|---|---|
| `src/format.ts` | 标题/内容/按钮文案/时间格式化（`buildTitle(kind, date)`、`buildContent(...)`、选项列表渲染） | 纯函数 |
| `src/notify-cmd.ts` | 构造 `termux-notification` 参数数组（`buildNotificationArgs(opts)`：title/content/id/buttons/action/on-delete/ongoing…）与 `buildHelperCall(...)`（helper 调用串，处理 `$REPLY` 转义） | 纯函数 |
| `src/replies.ts` | 回复文件名生成/解析（`encodeReplyFile`/`parseReplyFile`）、`decodeReply`（$REPLY 原文 → 结构化） | 纯函数 |
| `src/config.ts` | 默认配置、路径构建（`configDir()` 用 `CONFIG_DIR_NAME`）、`loadConfig`/`saveConfig`、`parseNotifyCommand`（`/notify` 参数解析） | 纯函数（fs 注入或薄封装） |
| `src/ask.ts` | pending ask 状态机：`createAsk`/`resolveAsk`/`cancelAsk`/`timeoutAsk`、超时计算、结果序列化 | 纯函数（时间注入） |
| `src/index.ts` | 接线：TUI 守卫、事件注册（agent_settled / session_shutdown）、tool 注册、命令注册、轮询循环、spawn 通知、helper 生成 | 不单测 |

### 4.1 `termux-notification` 参数约定
- 需求 1：`--id pi-notify-result --title "✅ pi · HH:MM" --content <全文> --button1 回复 --button1-action '<helper> notify <ts> "$REPLY"' --button2 打开终端 --button2-action '<Termux am 绝对路径> start -n com.termux/.app.TermuxActivity'`（`--on-delete` 不设，滑掉无副作用）
- **“打开终端”用 Termux 自带的 am 封装**（`<PREFIX>/bin/am`，termux-am）：系统 `/system/bin/am` 是 shell 特权工具，Android 10+ 普通 app 调用被拒（实测 Permission Denial）。
- 需求 2 options：`--id ask-<id> --title "❓ pi 提问 · HH:MM" --content <问题 + 选项列表> --button1 <opt1> --button1-action '<helper> ask <id> 1' ... --buttonN ...`；input：`--button1 回复 --button1-action '<helper> ask <id> "$REPLY"'`
- options tool 同时提供 Direct Reply？**不**（D5 拆分：options tool 纯按钮；input tool 纯输入）。options 超 3 个 → tool 报错让 LLM 收敛。
- `$REPLY` 转义：action 串内 `$REPLY` 保持字面（termux-api 替换），helper 参数用双引号包裹；helper 内 `printf '%s' "$2" > file` 防注入。
- 空输入（Direct Reply 直接发送空串）→ 视为**取消**（写 cancelled 语义）。
- **终结反馈（方案 B）**：不再依赖 `termux-notification-remove`（OPPO ColorOS/Android 16 实测无效——app 端 `NotificationManager.cancel()` 被系统静默忽略）。answered/timeout 时扩展用**同 id 重新 notify** 替换为状态通知（`✅ 已收到你的回复 ✓` / `⏰ 提问已超时`）+ `termux-toast`；cancelled（滑掉）无需替换。helper.sh 不调 remove。

### 4.2 helper.sh（启动时生成，绝对路径）
```sh
#!/data/data/com.termux/files/usr/bin/sh
# $1 = notify <ts> | ask <id> | cancel <id>
# $2 = 回复文本（或空）
dir="<HOME>/.pi/pi-notify-termux/replies"
case "$1" in
  notify) printf '%s' "$2" > "$dir/notify-<ts>.reply" ;;
  ask)    printf '%s' "$2" > "$dir/ask-<id>.reply" ;;
  cancel) : > "$dir/ask-<id>.cancel" ;;
esac
```
- `--on-delete` action = `<helper> cancel <id>`：滑掉通知 → `.cancel` 标记 → 轮询发现 → pending ask resolve `cancelled`（无需等超时）。
- 生成时把 `<HOME>`/路径实参替换为字面绝对路径；helper 在启动与每次回复前确认存在（防用户删）。

## 5. 行为语义

### 5.1 需求 1（agent_settled 通知）
- 触发：`pi.on("agent_settled")`，且 `ctx.isIdle() === true`、`/notify` 开启、`termux-notification` 可用。
- 内容：最终 assistant 消息文本。取 `agent_end` 的 `event.messages` 中最后一条 assistant 消息缓存，或 settled 时从 ctx 取（实现以可拿到为准，见 TICKETS 验证）；消息为空（无文本输出）→ 不弹通知。
- 回复注入：轮询发现 `notify-*.reply` → `pi.sendUserMessage(text)`（settled 后空闲，立即触发新一轮，source=extension）。
- 固定 id 原地更新；新一轮 agent 结束再次覆盖。
- 通知被滑掉：无副作用（不取消任何 pending）。

### 5.2 需求 2（tool）
- `notify_ask_options`：参数 `question: string`（必填）、`options: string[]`（1–3 项，超 3 → 错误）。通知含 `<id>`，按钮 1..N 对应选项；点击 → resolve `{status:"answered", selection: "N", option: "<原文>", text: "<原文>"}`。
- `notify_ask_input`：参数 `question: string`（必填）、`timeout?: number`（秒，0=不超时，默认取配置 `timeoutSec`）。Direct Reply → resolve `{status:"answered", selection: null, option: null, text: "<输入>"}`。
- 空输入 / 滑掉 → `{status:"cancelled"}`；超时 → `{status:"timeout"}`（都带 `question` 回显，LLM 可重试或收尾）。
- tool 描述与 `promptGuidelines`：指导 LLM 何时用（用户离开终端/需要即时决策/需明确选择时；`notify_ask_options` 用于有限选项，`notify_ask_input` 用于自由文本）。每条 guideline 带 tool 名。
- 不可用降级：`termux-notification` 缺失/通知权限未授予 → tool 返回错误（LLM 转用 `ctx.ui` 提问或告知用户）。

### 5.3 /notify 命令
- `/notify on` → enabled=true 持久化 + notify 确认；`/notify off` → enabled=false + notify；`/notify`（无参）→ 显示当前状态（含 Termux 环境/权限提示）。
- 未知参数 → 报错 + 用法（`parseNotifyCommand` 纯函数）。

### 5.4 竞态与并发
- LLM 串行调用，同时至多一个 pending ask；实现支持多个（文件 id 隔离），不额外加锁。
- **阻塞等待期间用户在终端直接输入**：pi 将其排队（followUp），ask 结束后才处理——SPEC 认可该行为，tool 描述中不承诺"抢答"。
- 需求 1 回复与 pending ask 文件互不干扰（`notify`/`ask` 前缀隔离）。
- 轮询消费即删；崩溃残留文件在启动时清理（`replies/` 清空）。

### 5.5 生命周期
- `session_shutdown`：取消全部 pending ask（resolve cancelled），停止轮询（若引用计数归零）。
- `/reload`：扩展重启，pending 丢失（通知仍在但回复无人消费 → 启动清理只清文件，通知 id 由下一轮覆盖；可接受）。
- 仅 TUI 模式注册（D8）；非 TUI 不加载。

## 6. 验收要点
- `npm test`（vitest）全绿；`npm run typecheck` 通过。
- 手动验收（本机）：agent 结束后通知出现且内容为最终回复；通知内输入 → 作为下一轮输入被 LLM 看到；两个 tool 在对话中被 LLM 正确调用（构造 prompt 触发）；滑掉通知 → tool 返回 cancelled；超时 → timeout；`/notify off` 后无通知。
