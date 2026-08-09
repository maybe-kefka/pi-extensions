# R24 SPEC：头像对齐 + 底部空间 + think 窗口 + 滚动条统一 + 工具结果窗口期感知

## 背景

R23 性能优化后 UI 细节迭代（用户 4+1 项）：

1. **头像对齐**：MessageAvatar `self-end`（底部对齐）→ 用户要求与气泡顶部对齐
2. **底部空间**：聊天流底部 padding 32px（R21 pb-8）→ 扩大到整个视窗的 25%（`pb-[25vh]`）
3. **think 窗口**：LLM 工作时的 thinking 块全文无限制渲染 → 限制 4 行内 + scroll area（滚动查看全文）
4. **滚动条统一**：现状三种混用（聊天流原生 thin / SessionList+TreeDialog Radix ScrollArea / 其余裸 overflow）→ 统一为原生 thin 样式（与聊天流对齐）
5. **工具结果窗口期感知**：`tool_end`（工具执行完成）→ 下一轮 `text_delta`（LLM 开始流式输出）之间的窗口期无任何指示（turn_end 已 final 化工具轮，R22 的 ▍ 不覆盖此窗口）→ 气泡内容区第一行显示 spinner + "thinking......"（占位，thinking 到达后替换为实际内容）

## User Stories

**US1（P1）头像上对齐**：LLM 侧与用户侧头像与气泡顶部对齐（不再与消息底部对齐）。

**US2（P1）底部空间**：聊天流底部（最后消息 → 输入框）空间 = 视窗高度 25%。

**US3（P2）think 窗口限制**：StreamingSteps 的 thinking 块最大显示 4 行，超出滚动查看（全文可查）。

**US4（P2）滚动条统一**：所有滚动容器统一原生 thin 滚动条（scrollbar-width thin + muted-foreground），与聊天流一致。

**US5（P1）工具结果窗口期**：tool_end → 下一轮 text_delta 期间，assistant 气泡内容区第一行显示 spinner + thinking 文本（占位 "thinking......"，thinking 流式到达后实时替换）。

## 验收场景

### US1
- AC1：MessageAvatar className 含 `self-start`（不再 self-end）
- AC2：冒烟：长回复气泡头像与气泡顶部齐平

### US2
- AC1：MessageScrollerContent `pb-[25vh]`
- AC2：冒烟：滚动到底后最后消息距输入框 ≈ 视窗高度 25%

### US3
- AC1：step-thinking 块 `max-h-16 overflow-y-auto`（4 行）
- AC2：冒烟：超 4 行 thinking 出现滚动条，全文可滚查看

### US4
- AC1：SessionList/TreeDialog 不再用 Radix ScrollArea（原生 div + scrollbar-thin）
- AC2：Sidebar/ProgressDialog/MentionMenu/InputBar 编辑器/Select 补 scrollbar-thin（弹出层不补 gutter-stable）
- AC3：scroll-area.tsx 无使用点（删除或保留无引用）

### US5
- AC1：tool_end 后 reducer `processingToolResult` = ""（窗口期开始）
- AC2：thinking_delta（窗口期内）更新 processingToolResult 为 thinking 内容
- AC3：text_delta 清除 processingToolResult（窗口期结束）
- AC4：agent_end/agent_settled/session_start/history 清除
- AC5：Chat 渲染：窗口期 assistant 气泡第一行 `[data-slot=tool-processing]`（spinner + 文本占位/thinking）；窗口期 StreamingSteps 的 thinking 块隐藏（避免重复显示）
- AC6：冒烟：工具完成后立即出现 spinner + thinking......，thinking 到达后文本更新，text 流式后指示器消失

## FR

- FR-001：message.tsx MessageAvatar `self-end` → `self-start`
- FR-002：Chat.tsx MessageScrollerContent `pb-8` → `pb-[25vh]`
- FR-003：Chat.tsx StreamingSteps step-thinking：`max-h-16 overflow-y-auto scrollbar-thin`（4 行滚动）
- FR-004：滚动条统一：SessionList/TreeDialog 原生 div + `scrollbar-thin scrollbar-gutter-stable`；Sidebar/ProgressDialog/MentionMenu/InputBar 补 `scrollbar-thin`；Select 弹出层补 `scrollbar-thin`；删 scroll-area.tsx（无使用点）
- FR-005：stream.ts：`processingToolResult: string | null`（initial null）；tool_end → ""；thinking_delta（窗口期内）→ 更新 thinking；text_delta → null；agent_end/agent_settled → null；session_start/history → null
- FR-006：Chat.tsx：TurnBubbleView 收 `processing` prop（仅最后一个气泡，来自 state.processingToolResult）；Bubble 内容区第一行指示器（Loader2 + `processing || "thinking......"`，data-slot=tool-processing）；StreamingSteps 收 `processing` prop——thinking 块渲染条件加 `!processing`（窗口期由指示器显示 thinking，避免重复）

## 非目标

- 不改 pi 内核事件流（窗口期判定基于现有 tool_end/text_delta 事件）
- 不改变 thinking 完整内容可查性（滚动 + progress 弹窗保留全文）
- 不做滚动条 hover 变粗/自定义轨道（统一到现有 scrollbar-thin 视觉）

## 技术要点

- 25vh 用视口单位（"整个视窗的 25%"）；内容不满一屏时输入框上方保持 25vh 空白（padding 计入滚动高度）
- text-xs 行高 1rem → 4 行 = `max-h-16`（4rem）
- scrollbar-thin utility 已存在于 index.css（scrollbar-width: thin; scrollbar-color: var(--muted-foreground) transparent）
- 窗口期指示器仅渲染于最后一个气泡（Chat map 时 isLast 判断）；占位文案 "thinking......" 由用户指定
- 窗口期 thinking 单行显示（指示器内），完整 thinking 流式结束后由 StreamingSteps 恢复显示（text_delta 后 processing 清除 → thinking 块恢复）
