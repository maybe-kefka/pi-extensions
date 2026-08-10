# Session Follow 迭代 SPEC

> 依据 `/skill:to-spec` 生成。seams：唯一测试缝 = `probePrivileged` 纯函数（特权有效性探测）；其余为薄接线（事件驱动 UI 跟随），浏览器冒烟验收。

## Problem Statement

在 TUI 里切换会话后，web 控制台没有完整跟随：会话列表高亮与会话名停留在旧会话（`refreshSessions` 只在连接/手动/删改后调用）；消息区清空后不加载新会话历史（`pi:getMessages` 只在连接时拉一次）；特权操作（切换/新建/树导航）因内核 command ctx 仅命令执行时创建而降级，但前端提示只在第一次操作报错后才出现、且恢复后（TUI 重跑 /web）降级提示永不消失（`degraded` 只 set 不 reset）。

## Solution

TUI 切换会话后 web 完整跟随：会话列表、当前高亮、会话名、消息历史全部自动切换到新会话（`session_switch_ready` 触发列表刷新 + 历史重拉）；特权能力状态在切换时主动探测并广播，前端立即显示/清除降级提示条（不再等操作报错、不再残留）；TUI 重跑 /web 后提示条自动消失。

## User Stories

1. 作为用户，我在 TUI 切换会话后，希望 web 会话列表高亮自动跟随新会话，这样我知道当前在哪个会话
2. 作为用户，我在 TUI 切换会话后，希望 web 消息区加载新会话的历史消息，这样我能继续查看/对话
3. 作为用户，我在 TUI 切换会话后，希望 web 立即明确提示特权操作（切换/新建/树导航）的状态，而不是等我操作报错才知道
4. 作为用户，我在 TUI 切换会话后，希望发消息等基础功能正常可用（已有能力，保持）
5. 作为用户，我在 TUI 重跑 /web 后，希望降级提示自动消失（特权恢复），而不是残留
6. 作为用户，我在 web 内切换会话（带特权续链），希望不出现降级提示
7. 作为用户，我希望提示条文案说明"发消息正常 + 如何恢复特权"

## Implementation Decisions

- **前端切换跟随**：`session_switch_ready` 事件到达时（映射已有）→ App 里执行 `refreshSessions()` + 重新请求 `pi:getMessages`（按当前会话返回历史）→ 列表高亮/会话名/消息区全部跟随；`session_start` 的 bubbles 清空逻辑保留（历史渲染走 history action）
- **特权探测（唯一 seam）**：`probePrivileged(priv)` 纯函数——调用 `priv.getSystemPromptOptions()`（command ctx 的 assertActive 探针）；成功 → true；null/抛错（stale）→ false
- **服务端广播**：`session_start`（reason 任意）时执行探测 → `broadcast("privilege_status", { ok })`；探测失败时 `state.privileged` 置 null（后续报错文案统一为"未就绪"而非内核 stale 原文）；`/web` handler 的 isRunning 分支同样广播 `privilege_status { ok: true }`（重跑恢复检测）
- **前端降级响应**：App 监听 `privilege_status` → `setDegraded(!ok)`（替换只 set 不 reset 的 privilegedError 路径；privilegedError 保留兜底）
- **提示条文案**：「已切换到新会话：对话正常；切换/新建/树导航需在 TUI 输入 /web 恢复」——`session_switch_ready` 且特权降级时显示（现状 SessionList 顶部 degraded 条位置）
- **探测时机注意**：web 内发起的切换（withSession 续链）→ 探测 true → 不降级；TUI 切换 → 探测 false → 降级 ✓

## Testing Decisions

- 好测试的标准：只测外部行为——探针输入（priv 对象行为）→ 输出（boolean）
- **唯一测试模块：probePrivileged**——覆盖：null → false；正常 priv → true；抛 stale 错误 → false；抛其他错误 → false
- 先例：theme.ts / web-ask.ts 纯函数单测
- 其余（事件广播、前端刷新/历史加载、降级提示显隐）为薄接线：浏览器冒烟验收——rpc 通道 `/resume` 模拟切换 → 验证列表/历史/提示条跟随

## Out of Scope

- 内核侧特权恢复（TUI 切换后扩展无法自动获取 command ctx——pi 内核设计边界；记录为上游 feature 建议）
- 切换动画/过渡效果
- 消息历史的分页/懒加载（历史全量拉取，现状不变）
- 会话名/列表排序调整

## Further Notes

- `session_switch_ready` 由服务端 session_start handler 广播（已有）——前端刷新动作挂此事件
- 基线 SPEC §3.1 的"发消息自动恢复"能力保持不变（factory 重跑重绑 api）
