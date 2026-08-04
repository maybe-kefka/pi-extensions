# pi-notify-termux 包说明

`@kefka/pi-notify-termux`：把 pi 的 agent 结果与交互带到 Android 通知栏（Termux 环境）。
- 需求 1：`agent_settled` 弹最终回复通知（Direct Reply 输入 = 下一轮用户消息）
- 需求 2：`notify_ask_options` / `notify_ask_input` 两个 tool，阻塞等用户回复
- `/notify on|off|status` 总开关（状态含通知栏实时状态）

权威文档：`docs/pi-notify-termux/SPEC.md`（需求）、`TICKETS.md`（任务），改动先读 SPEC。

## 目录结构

```
src/
├── index.ts        # 薄接线层：事件/tool/命令注册、轮询、spawn 通知（不单测）
├── ask.ts          # 纯函数：pending ask 状态机（超时/幂等/序列化）
├── config.ts       # 纯函数：配置读写（~/.pi/pi-notify-termux/config.json）+ /notify 解析
├── format.ts       # 纯函数：标题/内容/选项列表文案
├── helper.ts       # 纯函数：helper.sh 生成（回复文件桥脚本）
├── notify-cmd.ts   # 纯函数：termux-notification 参数数组构造
├── notify-list.ts  # 纯函数：termux-notification-list 输出解析（/notify status）
└── replies.ts      # 纯函数：文件桥编解码（防穿越、空输入=取消）
test/               # vitest 单测（TDD，以 npm test 全绿为准）
```

## 硬约束

- `src/index.ts` 薄接线，不写业务逻辑、不做单测；其余模块纯函数 + TDD
- 类型导入用 `import type`；`@earendil-works/pi-coding-agent` 类型导入（devDep）+ `CONFIG_DIR_NAME` 值导入（peer 声明，宿主 jiti 别名提供）；`typebox` devDep（运行时由 pi 宿主别名）
- 运行时零 npm 依赖（仅 Node 内置 + 外部命令 termux-notification 等）
- 改代码后必须 `npm test` + `npm run typecheck`；发布必须用户明确指示

## 实测知识库（OPPO ColorOS / Android 16，2025-08 验证）

### 权限（缺一项即静默失败）
- **Termux:API 通知权限必须全开**（ColorOS 有细分类别，总开关≠全开）。只开总开关时：通知发得出去，但 `termux-notification-remove` 的 `cancel()` 被系统静默忽略（通知永不消失）。全开后 remove 有效（分步实测：发→看→remove→消失）。
- **ColorOS "后台弹出界面"**（设置→应用管理→Termux→权限）控制"打开终端"按钮：Android 10+ 禁止后台 app 启动 Activity，termux-am 也无绕过（源码确认普通 startActivityAsUser）。不开时点按钮无声失败（已降级为 toast 提示）。

### 命令/机制
- **`/system/bin/am` 不可用**：shell 特权工具，普通 uid 调用报 `Permission Denial: package=com.android.shell does not belong to uid`。必须用 Termux 自带 `<PREFIX>/bin/am`（termux-am，app_process 以 app 身份执行）。
- **`termux-notification-remove` 只接受位置参数**（`remove <id>`），没有 `--id` 选项（传了报 illegal option）。
- **`termux-notification-list`** 权限全开后可用；**权限未开时它会挂起**（客户端等 app 响应）→ 所有 spawnSync 必须带 `timeout: 3000` 保护，自检失败返回 null 优雅降级（曾因此卡死 pi 启动，已修）。**权限自检**：发 `--alert-once` 诊断通知（`pi-perm-diag`）→ list 确认在栏 → 移除——在栏=权限可用，不在栏=未开/未开全（实测可行）；启动时与 `/notify` 时自动执行，失败弹警告。
- **通知 action 在干净环境执行**（dash -c，PATH 丢失）→ helper/am/toast 一律绝对路径。
- **Direct Reply**：action 里字面 `$REPLY` 由 termux-api 替换为带引号的用户输入；helper 内 `printf '%s'` 防注入；**空输入 = 取消**。
- **滑掉通知 = 取消**：`--on-delete` 写 `.cancel` 标记，阻塞 tool 立即返回 cancelled（不等超时）。
- 按钮最多 3 个；options tool 纯按钮、input tool 纯输入（不混用）。
- "Tasks: N"（Termux 常驻通知）= action 执行痕迹，正常现象。

### 设计要点
- 回复经文件桥（helper.sh 写 `replies/`，扩展 500ms 轮询消费即删）；`ask-<id>` → resolve tool，`notify-<ts>` → `sendUserMessage` 注入下一轮。
- 终结反馈：按钮/超时 → `termux-notification-remove` + toast；**Direct Reply 回复 → 先同 id 替换为"已收到"状态通知，2s 后自动 remove**（实测：Direct Reply 污染原通知实例，remove 被系统忽略；替换后是新实例，remove 恢复有效；`setTimeoutAfter` 系统机制 termux-api 未暴露，故用扩展侧定时 remove）。helper 不碰 remove（避免竞争）。
- 仅 TUI 模式加载（print/json/rpc 不注册行为）；无 focus 检测（砍了需求 3，dumpsys 全被权限墙挡）。
- 超时默认 5 分钟（config.timeoutSec / tool timeout 参数覆盖，0=不限）；`notify_ask_options` 无 timeout 参数（只有 input 有）。

## 常用命令

```bash
npm test              # vitest 全量（仓库根）
npm run typecheck -w @kefka/pi-notify-termux
```

开发期加载：仓库根 `.pi/settings.json` 已注册入口，`/reload` 生效；改动 helper 相关代码后注意重新生成（session_start 时自动）。
