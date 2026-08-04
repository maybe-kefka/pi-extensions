# @kefka/pi-notify-termux

Pi 扩展：把 pi 的 agent 结果与交互带到 **Android 通知栏**（Termux 环境）。

- **结果通知**：agent 结束后弹通知展示最终回复全文，可在通知里**直接输入回复**作为下一轮输入（Direct Reply）
- **通知提问**：给 LLM 提供 `notify_ask_options`（选项按钮，≤3）/ `notify_ask_input`（自由输入）两个 tool，阻塞等待用户回复（超时/滑掉取消）
- **总开关**：`/notify on|off|status`
- **确认引导**（新）：向 pi 进程注入系统提示词，引导 LLM 在不确定时（意图歧义/不可逆操作/信息缺失）优先用 `notify_ask_options`/`notify_ask_input` 通知你确认，而不是自作主张；`/notify confirm on|off` 切换，默认开启

## 安装

```bash
# 1. 安装 Termux:API 插件（F-Droid 或 GitHub，与 Termux 同签名）
# 2. 安装命令行工具
pkg install termux-api
# 3. 安装扩展（或按 monorepo 开发方式加载）
pi install npm:@kefka/pi-notify-termux
```

## 权限配置（重要，缺一项就静默失败）

| # | 权限 | 怎么配 | 影响什么 |
|---|------|--------|----------|
| 1 | **Termux:API 通知权限** | 设置 → 应用 → Termux:API → 通知 → **全部开启** | 通知发送 / 移除 / 通知栏列表。**ColorOS/OPPO 必须开全**：通知权限有细分类别，只开总开关会导致 `cancel()`（移除通知）被系统静默忽略——通知发得出去但永远不消失 |
| 2 | **Termux 通知权限** | 设置 → 应用 → Termux → 通知 → 允许 | 通知按钮 action 经 Termux 服务执行；Termux 常驻通知显示任务数（"Tasks: N"为正常现象） |
| 3 | **Termux "后台弹出界面"（仅 ColorOS/OPPO）** | 设置 → 应用管理 → Termux → 权限 → 后台弹出界面 → 允许 | **"打开终端"按钮**。Android 10+ 禁止后台 app 启动 Activity；不开则后台点按钮切不回 Termux（已降级为 Toast 提示）。改后通常无需重启，如无效请强制停止 Termux 再开 |
| 4 | 电池优化白名单（建议） | 设置 → 电池 → 后台耗电管理 → Termux 允许 | 长任务 + 通知链路不被杀；锁屏后通知照常弹出 |

Android 13+ 首次使用后可用 `/notify` 查看状态提示。

**权限自动检测**：扩展启动时与 `/notify` 时自动执行静默自检（发 `--alert-once` 诊断通知 → `termux-notification-list` 确认在栏 → 立即移除）；检测失败会弹出警告提示打开 Termux:API 通知权限。

## 功能

### agent 结束后（需求 1）
`agent_settled` 时弹出：

```
✅ pi · 12:30
<最终回复全文，可展开>
[ 回复 ] [ 打开终端 ]
```

- **回复**：Direct Reply 输入框，发送后通知消失 + Toast，内容作为下一轮用户消息注入
- **打开终端**：切回 Termux 前台（要求权限 #3）
- 固定 id 原地更新，不堆积；**已读即清**：你回到终端开启下一轮对话、点 [回复] 注入新一轮、切换 session、reload 或退出时，结果通知立即移除（不再残留）

### 通知提问 tools（需求 2，阻塞等待）

| tool | 参数 | 用户交互 | 返回 |
|------|------|---------|------|
| `notify_ask_options` | `question`, `options`(1–3) | 通知内选项按钮 | `{status:"answered", selection, option, text}` |
| `notify_ask_input` | `question`, `timeout?`(秒, 0=不限) | 通知内输入框 | `{status:"answered", text}` |

- 超时（默认 5 分钟，可配）→ `{status:"timeout"}`；用户滑掉通知 → `{status:"cancelled"}`（立即返回，不等超时）
- 终结反馈（全部统一"直接消失"）：按钮/超时 → 通知立即移除 + Toast；Direct Reply 回复 → 先同 id 替换为新实例（污染实例 remove 被忽略）→ 立即移除 + Toast
- 仅 TUI 模式注册；非 TUI（print/json/rpc）不加载

### /notify 命令

- `/notify`：状态（含权限自检结果 + 通知栏里 pi 通知的实时状态）
- `/notify on` / `/notify off`：总开关，持久化到 `~/.pi/pi-notify-termux/config.json`
- `/notify confirm on|off`：确认引导开关（持久化，默认 on）
- `/notify confirm`：查看确认引导状态

## 配置

`~/.pi/pi-notify-termux/config.json`（自动创建）：

```json
{ "enabled": true, "timeoutSec": 300 }
```

## 架构（一句话）

通知 action（干净 shell 环境）经 `helper.sh` 写回复文件到 `~/.pi/pi-notify-termux/replies/`，扩展 500ms 轮询解析：`ask-<id>` 回复 → resolve 阻塞中的 tool；`notify-<ts>` 回复 → `sendUserMessage` 注入下一轮。

## 已知限制（OPPO/Android 16 实测）

- `termux-notification-remove` 需要权限 #1 **全开**才有效
- 系统 `/system/bin/am` 是 shell 特权工具，普通 app 调用被拒（`Permission Denial: package=com.android.shell...`）；"打开终端"使用 Termux 自带 am 封装（termux-am）
- 前台 app 检测不可行（dumpsys 全被权限墙挡住），因此无"非 focus 才通知"模式——用 `/notify off` 手动防打扰

## 开发

```bash
npm test              # vitest 全量
npm run typecheck     # tsc --noEmit
```

设计规格与任务清单：`docs/pi-notify-termux/SPEC.md` / `TICKETS.md`（monorepo）。
