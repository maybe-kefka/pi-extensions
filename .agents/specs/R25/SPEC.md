# R25 SPEC：compact 锚定 + web 提问工具 + '/' 空格关闭 + Progress 重构 + 首轮指示器 + 发送排队

## 背景

R24 完成后用户提出 4 项新需求 + 冒烟发现 4 个新问题。grilling 决策汇总：

### 需求 1：compact 差记录位置锚定（Q1=a）
- 现状：compact 记录渲染在 `bubbles.map` 之后（Chat.tsx:501-521）——永远在消息流最后
- 内核事实：compact **只在轮边界触发**（上一轮完整消息后、下一轮 message_start 前，`_checkCompaction` agent-session.js:776/865）
- 方案：`session_before_compact` 到达时记录最后气泡 id（anchorBubbleId）→ 渲染时插入该气泡之后；后续新消息自然排在其后
- 附带修复：服务端 mapEvent("session_compact") 丢弃 willRetry（server/interface/events.ts:106-107）→ 补字段，"将重试上一条消息"文案恢复

### 需求 2：web 提问工具（Q2=a / Q3=a' / Q4=a / Q5=a / Q6=a）
- 3 个独立工具：`web_ask_single`（单选 `{question, options[2..6]}`）/ `web_ask_multi`（多选 `{question, options[1..8], maxSelect?}`）/ `web_ask_text`（文本 `{question, placeholder?}`）
- **阻塞等待模式**：execute 内 `await new Promise`（照 pi-notify-termux askAndWait，src/index.ts:276-316）；LLM 自动暂停，回答后结果入上下文自动继续
- 回答通道：前端检测 web_ask 工具调用（tool_start args）→ assistant 气泡内渲染交互卡片（单选选项组/多选 checkbox/文本输入+提交）→ RPC `web-ask:answer {toolCallId, answer}` → 服务器 resolve pending
- 超时 10 分钟 → 返回「用户未在期限内回答」；signal abort → 取消
- TUI 同会话兜底：超时返回未回答（Q5=a）
- 每轮系统提示注入：`pi.registerTool` 的 promptSnippet/promptGuidelines（Tools 区每轮注入）+ `before_agent_start` 返回 systemPrompt 追加引导（照 pi-notify-termux src/index.ts:407-416）

### 需求 3：'/' 上拉框空格关闭（无分叉）
- 现状：激活态空格进 query（"abc "），面板不关（mention.ts:38）
- 方案：激活态（kind=skill）按空格 → 关闭面板 + 重置 mention 状态（prevWasSpace 一并清）；`/abc ` 文本保留为纯文本
- 与 chip 后自动补空格无冲突（selectMention 已 reset）

### 需求 4：Progress 弹窗重构（无分叉）
- 现状：每步前置「第 x 轮 · 内容/思考/工具」label（Chat.tsx:272/280/288）；ReasoningBlock 默认折叠
- 方案：按 turn 分组：每组小 title「第 x 轮」；content 无 label 平铺（Markdown 不变）；reasoning 不折叠（text-xs 灰字 pre，沿用 ReasoningBlock 展开区样式）；tool 保持 ToolCard（默认折叠不变）；「第 x 轮」title 不可折叠
- 顶层死代码 openReasoning/openTools/toggle（Chat.tsx:246-253）一并清除

### 新问题 1：首轮窗口指示器（Q7=a）
- 用户消息发送后 → LLM 首轮输出前，显式 spinner + "thinking......"（与 tool_end 窗口一致）
- 触发：`turn_start` 且 `processingToolResult === null` → 设 ""（工具轮后的 turn_start 不覆盖——此时 tool_end 已设）
- 指示器显示期间 R22 空 turn 的 ▍（working-caret）隐藏（同一等待语义不重复）

### 新问题 2：thinking 滚动跟随（无分叉）
- 现状：step-thinking 是静态 div，内容追加 scrollTop 不跟随
- 方案：ref + effect（thinking 文本变化 → scrollTop = scrollHeight，active 流式时）

### 新问题 3：撤销 R24 防重复设计（Q8=a）
- R24 根因：thinking_delta 更新 processingToolResult + StreamingSteps 窗口期隐藏 thinking 块 → thinking 全文被关进指示器 truncate 行，滚动区不出现
- 方案：thinking 块窗口期**正常渲染**（去掉 processing 隐藏逻辑）；指示器文本**恒定 "thinking......"**（thinking_delta 不再更新 processingToolResult；该字段仅作窗口期标志）

### 新问题 4：发送排队（Q9=a）
- 现状：App.tsx:128 `pi:sendMessage {text}` 不传 deliverAs → 内核 busy 时报 "Agent is already processing"
- 方案：默认 `deliverAs: "steer"`（当前 turn 工具执行完后、下次 LLM 调用前注入——输出一结束就处理追加消息）

## User Stories

**US1（P1）compact 位置锚定**：压缩记录固定显示在触发时刻最后一条消息之后，"将重试上一条消息"提示可见。

**US2（P1）web 提问工具**：LLM 可通过 3 个工具在 web 上向用户提问（单选/多选/文本），阻塞等待回答，回答自动继续；每轮提示引导优先使用。

**US3（P2）'/' 空格关闭**：`/abc ` 后面板消失，文本保留为纯文本。

**US4（P2）Progress 弹窗重构**：每轮小 title「第 x 轮」，reasoning 不折叠缩小灰字，content/tool 保持。

**US5（P1）首轮窗口指示器**：用户发送后 LLM 输出前显示 spinner + "thinking......"。

**US6（P2）thinking 自动滚动**：流式输出时滚动区保持最新位置。

**US7（P1）发送排队**：LLM 输出时追加消息不报错，输出结束后自动处理。

## 验收场景

### US1
- AC1：stream：session_before_compact 记录 anchorBubbleId = 最后气泡 id（无气泡时 null）
- AC2：Chat：compact 记录渲染在 anchor 气泡之后（非 map 尾部）；无 anchor 时渲染在流首
- AC3：服务端 session_compact 透传 willRetry → 溢出重试时 done 态显示「· 将重试上一条消息」
- AC4：冒烟：压缩后记录位置固定，后续消息排在记录之后

### US2
- AC1：扩展注册 3 个 web_ask_* 工具（registerTool，TypeBox schema，promptSnippet/promptGuidelines）
- AC2：before_agent_start 追加系统提示引导（"遇到需澄清/决策的问题优先用 web_ask_* 询问"）
- AC3：execute 阻塞等待；RPC web-ask:answer resolve；10 分钟超时返回未回答；abort 取消
- AC4：前端：web_ask 工具卡片渲染交互 UI（单选组/多选 checkbox/文本+提交）；提交后显示回答结果
- AC5：冒烟：LLM 调工具 → 气泡内出现问题卡片 → 回答 → LLM 继续

### US3
- AC1：mention：激活态空格关闭面板（query 重置、prevWasSpace 清）
- AC2：InputBar：`/abc ` 文本保留
- AC3：测试：mention.test 新用例（激活空格关闭 / 关闭后可重新触发）

### US4
- AC1：Progress 弹窗：按 turn 分组，每组 title「第 x 轮」（text-[11px] 灰）
- AC2：content 无 label 平铺（Markdown）；reasoning 无 label 不折叠（text-xs 灰 pre）；tool 保持 ToolCard
- AC3：删除顶层死代码 openReasoning/openTools/toggle

### US5
- AC1：stream：turn_start 且 processingToolResult === null → ""
- AC2：Chat：指示器显示时 working-caret ▍ 隐藏
- AC3：冒烟：发送后立即出现 spinner + thinking......

### US6
- AC1：step-thinking 流式时 scrollTop 自动到底（thinking 文本变化 effect）

### US7
- AC1：App.tsx send 默认 deliverAs: "steer"
- AC2：冒烟：LLM 输出时发送消息不报错，输出结束后自动处理

## FR

- FR-001：stream.ts `compacting` 加 `anchorBubbleId: string | null`；session_before_compact 设置（最后气泡 id）；session_start 重置
- FR-002：Chat.tsx compact 记录渲染改为锚定插入（bubbles.map 内 anchor 气泡后；无 anchor 流首）
- FR-003：server/interface/events.ts session_compact 映射补 willRetry
- FR-004：新文件 `server/domain/web-ask.ts`：3 工具定义 + pending registry（resolve/timeout/abort）+ 结果序列化（纯函数可单测）
- FR-005：web-console.ts：注册 registerTool × 3 + pi.on("before_agent_start") 注入引导（进程级）
- FR-006：rpc-handler.ts 加 `web-ask:answer`（校验 toolCallId/answer 类型 → resolve）
- FR-007：依赖 @sinclair/typebox（照 pi-notify-termux "^1.3.11"）
- FR-008：Chat.tsx：web_ask 工具卡片 → 交互组件 WebAskCard（单选/多选/文本 + 提交；提交后显示结果）；提交调 RPC
- FR-009：mention.ts：激活态空格 → 关闭面板（新纯函数 mentionClose 或 resetMention 变体）
- FR-010：Chat.tsx ProgressDialog：按 turn 分组 + title「第 x 轮」+ reasoning 平铺灰字 + 删死代码
- FR-011：stream.ts：turn_start 且 processingToolResult === null → ""；thinking_delta 不再更新 processingToolResult
- FR-012：Chat.tsx：StreamingSteps 移除 processing 隐藏逻辑（thinking 块始终渲染）；▍ 条件加 !processing；指示器文本恒定 "thinking......"
- FR-013：Chat.tsx：step-thinking 加 ref + scroll 跟随 effect
- FR-014：App.tsx send 加 deliverAs: "steer"

## 非目标

- 不改 pi 内核/pi-notify-termux
- web_ask 不做 TUI 回答通道（Q5=a：超时兜底）
- 不做提问历史持久化（会话内状态）
- 不动 R24 的 tool_end 窗口指示器触发点（tool_end 仍设 ""）

## 技术要点

- 时序事实（R23）：agent_start → turn_start → message_start:user → message_start:assistant——turn_start 时空 turn 气泡已建，指示器渲染位置正确（assistant Bubble 第一行，用户消息为独立 Message）
- 工具事件：前端已有 tool_start（含 args）/tool_end（R18 映射）
- 提问工具 execute 阻塞期间事件流静默（tool row running）；回答后 tool_end → output=回答文本
- TypeBox：`Type.Object({ question: Type.String(...), options: Type.Array(Type.String(), {minItems,maxItems}) })`
- compact 渲染锚定用 React Fragment 在 map 内条件插入（`b.id === compacting.anchorBubbleId`）
- Progress 分组：entries 构造改为 `Array<{ turnIndex, steps: [...] }>`
- TDD：每 ticket 红→绿；R24 的 2 个相关测试（thinking 块隐藏/指示器替换）改写为恢复后断言
