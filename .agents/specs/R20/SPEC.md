# 迭代规格：R20 — 大 Turn 独立渲染 + compact 感知 + tool 可见性 + context 统计修复

> **生命周期**：草稿在 `.scratch/R20/SPEC.md`（gitignore）→ 迭代完成落盘 `.agents/specs/R20/SPEC.md`（长期保存）。
> 参照 spec-kit（github/spec-kit）spec-template 结构 + 敏捷（每次迭代 = 可独立验收的增量）。

**迭代**：R20
**创建日期**：2026-08-11
**状态**：Approved
**所属包**：@kefka/pi-web
**输入**：用户五条反馈——(1) 大 Turn 气泡 + fork/progress 按钮应独立（llm 输出时全部消失）；(2) compact 过程 web 无感知；(3) 流式中 tool_calls 不可见（应与 progress 弹窗一样默认折叠摘要）；(4) tool_calls 完成后下一轮 reasoning 前完全空白（清空应发生在新内容到达时）；(5) 右上角上下文弹窗系统提示词/上下文文件等项恒为 0。
**基线引用**：基线 SPEC §4.2/§4.3（事件协议）、§7（上下文面板）、R18 SPEC（langgraph 流式模型、progress 单 scroll 弹窗）——不复述。

## 目标

修复 web 控制台流式会话的五个感知/统计缺陷：大 Turn（一次完整任务的 ReAct 流程 = 气泡单元）间互不影响、compact 过程可见、流式中工具调用可见、轮间无空白、上下文分类统计真实。

## User Stories（按优先级 P1/P2/P3 排序，每故事独立可测）

### User Story 1 - 大 Turn 气泡与按钮独立（Priority: P1）

用户在 web 控制台发起任务 A（含工具调用的多轮 ReAct），完成后发起任务 B。任务 B 流式输出期间，任务 A 的气泡应保持完整内容与自己的 fork/progress 按钮；任务 B 的活跃气泡有自己的 progress 按钮（fork 仅完成态出现）。现状：任何气泡流式时所有气泡的按钮全部消失。

**独立验收**：发起两个连续任务；第二个任务流式期间，第一个气泡的 fork/progress 按钮可见可点；活跃气泡 progress 按钮可见（打开可见运行中流程）。

**验收场景**：

1. Given 已完成任务 A 的气泡（含工具轮），When 发起任务 B 且 B 正在流式，Then A 气泡内容完整保留且 fork/progress 按钮可见可点
2. Given 任务 B 正在流式（活跃气泡），When 查看活跃气泡，Then progress 按钮可见；fork 按钮不可见（完成态才出现）
3. Given 活跃气泡 progress 弹窗打开，When 工具执行中，Then ToolCard 显示 running 态（旋转图标）；完成后变 done 态

### User Story 2 - compact 过程可见（Priority: P1）

会话触发上下文压缩（手动 /compact、阈值或溢出恢复）时，web 端应有明确感知：压缩进行中显示横幅，完成后在消息流留一条系统记录。

**独立验收**：发起 /compact（或触发阈值压缩），web 端出现"正在压缩上下文…"横幅；完成后横幅消失并出现系统记录气泡。

**验收场景**：

1. Given web 会话空闲，When 发起 /compact，Then header 出现"正在压缩上下文…（原因）"横幅，持续到压缩完成
2. When 压缩完成，Then 横幅消失，消息流插入系统记录气泡（"上下文已压缩（原因：manual）"）
3. Given 溢出恢复场景（willRetry=true），When 压缩完成，Then 系统记录提示"将重试上一条消息"
4. Given 压缩后发送新消息，Then 正常流式（横幅不再出现）

### User Story 3 - 流式中工具调用可见（Priority: P1）

ReAct 流程中模型发起工具调用时，活跃气泡应立即显示默认折叠的工具摘要卡片（状态图标 + 工具名 + 输出预览，点击就地展开 args/output），与 progress 弹窗样式一致。现状：tool 块因事件顺序问题永不渲染。

**独立验收**：发起一个会调用工具的任务（如 read 文件），流式中气泡出现工具卡片；工具执行完成卡片变 done 态。

**验收场景**：

1. Given 任务含工具调用，When 模型输出 toolcall（tool_execution_start 前），Then 活跃气泡显示工具卡片摘要行（running 态）
2. When 工具执行完成（tool_execution_end），Then 卡片变 done 态（✓ 图标 + 输出预览截断）
3. When 点击卡片，Then 就地展开参数与输出全文；再点收起
4. Given 单轮含多个工具调用，Then 每个工具一张独立卡片按序排列

### User Story 4 - 轮间无空白（Priority: P1）

工具轮完成后、下一轮 reasoning 开始前，气泡不得空白。清空气泡（切换显示）只发生在下一轮有 content/reasoning 内容到达时，原子切换。现状：message_end 立即 final 化导致工具执行期间与轮间全白。

**独立验收**：发起含工具任务，工具完成后到下一轮 reasoning 出现之间，气泡持续显示上一轮内容（工具卡片 done 态），无空白帧。

**验收场景**：

1. Given 工具轮 message_end 已到、工具仍在执行，When 观察气泡，Then 显示工具卡片 running 态（不空白）
2. When 工具完成、下一轮 reasoning 未到，Then 气泡仍显示工具卡片 done 态（不空白）
3. When 下一轮 text/reasoning 首个 delta 到达，Then 气泡原子切换为新轮内容
4. Given 整个大 Turn 完成（终态），Then 气泡仍只显示最终回复文本（R18 不变）
5. Given agent 中断（无 turn_end），Then agent_end 兜底 final 化，气泡显示已有内容（不悬挂在流式态）

### User Story 5 - 上下文分类统计真实（Priority: P2）

右上角上下文弹窗的五个分类（系统提示词/上下文文件/技能/工具定义/对话消息）应显示真实估算值。现状：事件 ctx 无 getSystemPromptOptions → 系统侧四类恒 0。

**独立验收**：打开上下文弹窗，系统提示词分类显示非零值（完整系统提示词估算）；本仓库会话中上下文文件/技能分类非零；总占用 = 系统侧 + 对话侧。

**验收场景**：

1. Given 特权 ctx 可用（/web 命令执行过），When 打开弹窗，Then system = 完整系统提示词估算（getSystemPrompt()），contextFiles/skills/tools = getSystemPromptOptions() 真实注入数据估算
2. Given 特权失效（TUI 手动切会话），When 打开弹窗，Then 降级：system = getSystemPrompt() 估算，明细从提示词文本按段解析（<project_instructions>/Available tools:/<available_skills>），解析失败明细为 0 但 system 非 0
3. When 弹窗展示，Then total = system + conversation；明细（文件/技能/工具）只展示不参与 total；对话细分（user/assistant/toolResult/other）正常
4. Given 本仓库会话（有 AGENTS.md + .agents/skills），Then 上下文文件与技能分类非 0

## Edge Cases

- 工具轮 message_end 后 turn_end 迟迟不来（中断/异常）→ agent_end 兜底 final 化
- 单轮多个工具调用 → 每工具独立卡片；toolcall_start 与 tool_execution_start 交错顺序（实测 toolcall 先、execution 后，但需防御 execution 先到：tool_start 时无空 tool 块则在 steps 末尾补块）
- toolResult 消息事件（message_start/end role=toolResult）不渲染为气泡（现状保持）
- compact 进行中用户发消息 → 横幅存在但输入不受限（pi 侧排队/报错已有处理，web 不额外拦截）
- 压缩后 willRetry 的 turn 重新流式 → 新 turn 正常追加到同一气泡
- 会话切换（session_start）→ compacting 状态重置
- 文本解析降级时提示词模板结构变化 → 明细 0、system 非 0（优雅降级，不报错）

## 功能需求

- **FR-001**：每个气泡（大 Turn）的 fork/progress 按钮独立计算可见性：`hasUser && !bubbleStreaming(该气泡)`；活跃气泡额外显示 progress（fork 仅非流式气泡显示）
- **FR-002**：message_end 遇含 tool 块的 turn 不 final 化（等待 turn_end）；agent_end 兜底 final 化所有非 final turn
- **FR-003**：tool_start 时若无空 tool 块可填充，在活跃 turn steps 末尾追加 tool 块（防御 execution 先到）
- **FR-004**：气泡渲染：活跃 turn steps 为空时显示上一轮有内容的 turn（原子切换，无空白帧）；终态只显示最终回复文本
- **FR-005**：后端订阅 session_before_compact 并广播（reason/willRetry）；session_compact 已广播，前端新增 reducer case
- **FR-006**：前端 compacting 状态：横幅（进行中）+ 系统记录气泡（完成后，含原因；willRetry 时提示重试）
- **FR-007**：pi:getContextBreakdown 优先特权 ctx（getSystemPrompt + getSystemPromptOptions），失效降级事件 ctx getSystemPrompt 文本解析；total = system + conversation，明细不参与 total
- **FR-008**：会话切换（session_start）重置 compacting 状态；系统记录气泡随会话切换清空（非持久）

## 非目标

- 不改 ReAct loop 内部轮次的展示模型（R18：活跃轮显示、终态只留最终回复）——仅修清空时机
- 不做 tool 卡片动画/拖拽/重排
- 不持久化 compact 系统记录（会话刷新后不恢复）
- 不调整上下文面板的估算算法（chars/4 启发式保持）
- 不引入 per-turn（ReAct loop 内部）的 fork/progress 按钮——按钮属于大 Turn 气泡

## 技术方案要点

- **问题 3/4 同根因**：实测事件序 `message_end:assistant` 先于 `tool_execution_start` → message_end 提前 final 化 turn → tool_start 的块 id 填充分支（`turn.final` 短路）永不执行 → 块 id 恒空 → ToolCard 不渲染；渲染层 final 且 text 空 → 空白。修复 = message_end 不 final tool 轮 + 渲染层"最后有内容 turn 持续显示"
- **按钮**：showToolbar 从全局条件改为 per-bubble（`!bubbleStreaming(bubble)`）；活跃气泡单独加 progress 按钮
- **compact**：BROADCAST_EVENT_TYPES 加 `session_before_compact`；events.ts 映射（reason/willRetry/fromExtension）；前端 reducer 加 `session_before_compact`/`session_compact` case → `state.compacting`（{phase: "before"|"done", reason, willRetry}）；UI 横幅 + 系统气泡（reducer 生成系统记录条目，渲染为居中灰字卡片）
- **context**：privilegedCall 拿特权 ctx → getSystemPrompt()（system）+ getSystemPromptOptions()（明细）；降级事件 ctx getSystemPrompt() + 文本段解析（`<project_instructions path="...">` / `Available tools:` 到 `Guidelines:` / `<available_skills>`）
- 测试：streamReducer 单测（事件序回归：message_end→tool_execution_start 顺序下 tool 块填充与渲染数据）、ContextPanel 展示、context-breakdown 文本解析单测（纯函数）、compact reducer 单测
