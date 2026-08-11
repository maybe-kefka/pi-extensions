# SPEC：web-instances（web 独立服务 + 每会话独立实例 long-live）

迭代 slug：`web-instances`。基线：multi-instance-web（`.agents/specs/multi-instance-web/SPEC.md`）及其后全部迭代（chat 同级 tab 重构 / review 修复 / 历史加载 / long-live）。本 SPEC **推翻** multi-instance-web 的"宿主模式"（首个 /web 进程兼任服务）与"单进程多会话"（chat tab 切换 = switchSession）——经用户多轮 grilling 修正后的最终架构。

## Problem Statement

1. **切 tab 中断会话**：chat tab 切换触发 `switchSession`，pi 内核 `teardownCurrent()` 拆毁当前活动 turn——正在流式输出/执行工具的会话被 abort，任务中断、结果丢失。"页面状态 long-live"哲学被打破。
2. **宿主耦合**：web 服务寄生在第一个跑 `/web` 的 pi 进程上——该进程（通常是 TUI 主进程）退出，整个 web 服务消失；"宿主"概念使 web 与具体 pi 进程耦合，与"web 是独立控制面"的定位矛盾。
3. **进度条语义模糊**：Header 右上角全局进度条显示宿主 context 占用，与当前查看的 tab 无关；多会话下无法反映"我正在看的会话"的上下文水位。

## Solution

**彻底解耦 + 每会话独立实例**：

- **web 服务 = 独立进程**（`pi-web` bin，内部 = `pi --mode rpc --extension <pi-web 入口> --web`，无 TUI 常驻）。`--web` 同时兼容字面启动（unknownFlags 容忍，扩展检测 argv）。
- **无宿主**：每个 pi 进程都是对等注册者。TUI 进程 `/web` = 注册自己（当前会话随 session_start 更新）。`/web` 时服务未起 → 自动 spawn 服务进程（detached 后台）。
- **每会话一实例**：打开历史会话 tab → 服务进程 spawn `pi --mode rpc --extension <入口> --session <file>` 实例（自动注册，直接加载会话，无需 switchSession 接管）；新建会话 = spawn 新实例。切 tab 只是 UI 焦点切换——实例照跑，长任务并行。
- **tab 关 = 实例杀**（彻底释放；重开重新 spawn + 加载历史）。**同会话单 tab**。
- **TUI 切会话**：服务收到 TUI 注册者的 session_start → 杀掉该会话的 spawn 实例（jsonl 双写排他）→ 对应 tab 标记"已由 TUI 接管" → web 激活 TUI 注册者的 tab 并跟随新会话。
- **统一通道**：所有会话 tab（TUI 注册者 / spawn 实例）的发送/中止/回答统一走命令下行（agent 通道）；文件/git/上下文/会话列表走服务进程 RPC（rpc 模式扩展全能力已验证）。
- **进度条**：Header 全局条移除；chat input 左侧垂直水杯（~10px×~64px 圆角容器、水位从底往上、分级变色 <60% 绿 / 60-85% 黄 / >85% 红、点击打开 ContextPanel 详情），数据 = 对应实例的 context usage（注册者上报，协议扩展）。

## User Stories

1. 作为用户，我希望 `pi-web`（或 `pi --web`）独立启动 web 服务，这样服务不依附任何 pi 会话进程，退出 TUI 也不影响 web。
2. 作为用户，我希望在 TUI 里 `/web` 注册当前进程（无服务时自动拉起服务），这样我的会话出现在 web 控制台里。
3. 作为用户，我希望打开一个历史会话时它由独立实例服务，这样我的会话长期存活、不受其他 tab 操作影响。
4. 作为用户，我希望新建会话也由独立实例服务，这样多个会话可同时推进、互不 abort。
5. 作为用户，我希望切换 chat tab 不中断原会话（流式/工具继续跑），这样我可以并行监督多个任务。
6. 作为用户，我希望关闭 chat tab 彻底释放对应实例（进程终止），这样不浪费资源。
7. 作为用户，我希望重新打开已关闭的会话时快速恢复（重新实例化 + 历史加载），这样不丢失上下文。
8. 作为用户，我希望同一会话不能开两个 tab（已开的在会话管理中标记），这样避免同文件双写。
9. 作为用户，我希望在 TUI 侧切到某会话时，web 里该会话的实例自动让位（被杀）、tab 标记接管并切换到 TUI 当前会话，这样 jsonl 不会两个进程同时写。
10. 作为用户，我希望 chat input 左侧有一个垂直水杯进度条显示当前会话的 context 占用，这样我在输入时就能看到水位。
11. 作为用户，我希望水杯按占用分级变色（绿/黄/红），这样临近上限时有告警。
12. 作为用户，我希望点击水杯看到上下文占用详情（分类面板），这样可判断该压缩/清理了。
13. 作为用户，我希望 web 打开且无任何注册进程时显示引导（提示在 pi 里运行 /web），这样不困惑为什么是空的。
14. 作为用户，我希望实例意外退出（崩溃/被杀）时 tab 显示断线状态且可重新拉起，这样不卡死在加载态。
15. 作为用户，我希望每个 tab 的上下文占用实时反映（实例上报 usage），这样水杯水位是活的。

## Implementation Decisions

- **服务进程模式**：index 检测 `--web`（argv 或 bin 包装）→ 只启动 web 服务 + 注册表，**不注册自己、不提供会话 tab**。`--mode rpc` 常驻、无 TUI。
- **状态文件**：`.pi/web.json` 角色反转——**服务进程写**（端口/token/pid），注册者读。旧字段 hostPid 语义改为 serverPid（schema 兼容演进）。
- **注册协议扩展**（registry 已有 seam）：hello 带 `kind: "tui" | "spawned"` + sessionFile/sessionName；新增 **usage 上报**（事件 `usage_update`：percent/contextWindow/categories——事件触发 + 周期兜底）；welcome 回 processId。
- **spawn 会话实例**：`pi --mode rpc --extension <入口> --session <file>` + `PI_WEB_URL` 环境变量自动注册；cwd = 会话 cwd（session jsonl 的 cwd 字段）；stdin pipe 保活（既有冒烟教训）；SIGTERM 优雅终止（tab 关闭时）。
- **TUI 注册者 tab**：TUI 进程注册后其当前会话 = 一个 tab（普通注册者 tab，可关；注册本身保留，重开即回）；TUI session_start → 更新该 tab 的会话绑定 + 编排杀撞车实例。
- **客户端路由**：tab 标识 = 会话（sessionFile），进程与会话 1:1；事件按 processId → 会话 → tab 分发（既有 dispatchToProcess 扩展）；发送/中止/回答 → 服务进程 → 命令下行到对应进程（TUI/spawn 统一）。
- **编排逻辑**：服务端"事件 → 动作"决策抽成纯函数（spawn 服务、spawn 实例、杀撞车实例、激活跟随 tab、usage 更新、断线标记）——web-console 只做 IO 接线。
- **spawn 参数构造**：纯函数（argv/env 序列化——防引号/顺序回归）。
- **进度条**：usage-tier 纯函数（percent → tier/颜色/水位比例）+ 水杯组件（chat tab 内 input 左侧）；点击 → ContextPanel（现有面板复用）。
- **空态**：无注册者时 chat 区显示引导文案。
- **信任**：spawn 实例/服务进程的 rpc 模式项目信任走既有流程（--approve/信任参数），实现时冒烟验证。
- **实例上限**：不设限（个人使用场景）。

## Testing Decisions

- **编排纯函数全分支单测**（最高 seam）：给定事件/命令 + 注册表状态 → 期望动作（spawn/kill/activate/mark/usage 更新）——覆盖：无服务时 /web 注册、tab 关杀实例、TUI session_start 杀撞车 + 激活跟随、实例崩溃断线标记、重开 respawn。测试对象是纯决策函数，不涉及真实子进程。
- **spawn 参数构造单测**：argv/env 精确断言（含路径含空格/特殊字符用例——历史 argv 教训）。
- **注册协议解析单测**：registry 扩展字段（kind/usage）解析与进程表增删。
- **客户端**：tabs 状态机（会话 tab 绑定/单会话唯一/断线标记）、usage-tier 纯函数（分级边界）、水杯组件渲染（jsdom）。
- **冒烟（不自动化）**：真 spawn 服务与实例、双 tab 并行执行（A 长任务切 B 发消息互不干扰）、TUI 切会话杀实例 + tab 跟随、关 tab 进程终止、重开恢复历史、水杯水位随流式变化。
- 既有模式参照：registry/session-history/net-probe 单测 + 组件测试 + 冒烟脚本（`/tmp/<slug>-smoke/`）。

## Out of Scope

- pi 内核改造（原生 `--web` 支持/自定义 CLI 参数）——`--web` 靠 argv 检测与 bin 包装实现。
- TUI 侧 UI 改动；跨项目/多 cwd web 服务；会话迁移/合并；多用户鉴权；自动扩容/实例上限策略。
- spawn 实例间的会话互操作（A 实例操作 B 实例的文件等）。

## Further Notes

- **根因事实**：`switchSession` → 内核 `teardownCurrent()`——abort 是内核会话切换语义，web 无法在单进程模型下规避，多实例是唯一路径。
- **历史资产**：spawn 基础设施曾在 multi-instance-web 06 存在（execPath+argv[1]=pi 入口、PI_WEB_HOST_URL 自动注册、stdin pipe 保活），后被 review 作为死代码清理——本迭代复活并按新角色（服务进程统一 spawn）重写。
- **风险**：服务进程 rpc 模式的权限模型（文件/git RPC 需项目信任）——冒烟首要验证项；TUI 与 spawn 实例对同一 jsonl 的排他已由编排规则覆盖（TUI 切会话杀撞车实例）。
