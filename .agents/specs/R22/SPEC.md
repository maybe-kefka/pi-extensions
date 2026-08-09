# R22 SPEC：skill/file chip 标记与展开 + 气泡时机 + Backspace 修复

## 背景

四个用户反馈（R21 后）：

1. **用户气泡不渲染 chip**：skill 实际发送内容是 XML（`<skill name location>` 含正文），但 web 用户气泡显示原文文本；希望渲染为输入框同款 chip
2. **发送的是纯文本 `/skill:name`**：web 端 `sendUserMessage` 硬编码 `expandPromptTemplates: false`（基线 SPEC §40），pi 内核 `_expandSkillCommand` 不执行 → LLM 收到字面文本自己找 skill，不稳定；希望发送 TUI 同款 XML
3. **LLM 气泡出现时机**：assistant 区域只在 `message_start:assistant` 创建 turn 后才出现；希望 turn_start（TUI working 同时）就出现
4. **Backspace 删除 chip 无反应**：chip + 文本 + chip 组合，删完文本与空格后光标落在 chip 原子边界（无效位置），Backspace 无响应

## User Stories

**US1（P1）chip 标记与 skill XML 发送**：输入框 chip 序列化为带不可见标记的文本（`\u0001skill:name\u0001` / `\u0001file:path\u0001`）；提交后服务器端把**标记内的** skill 展开为 TUI 同款 XML（`<skill name location>References are relative to {baseDir}.{正文}</skill>`），文件标记剥离为路径文本；**只展开 chip 标记的**（手打 `/skill:xxx` 不展开）。LLM 收到与 TUI 一致的内容。

**US2（P1）用户气泡 chip 渲染**：用户消息文本中的 skill XML 段与文件路径渲染为 chip（与输入框同款视觉）；实时消息与历史回填统一渲染。

**US3（P2）气泡出现时机**：`turn_start` 时创建空 turn → assistant 气泡立即出现（▍ 光标），与 TUI working 同步；`message_start:assistant` 复用空 turn（不重复创建）。

**US4（P2）Backspace 修复**：光标位于 chip 边界无效位置时 Backspace 手动删除 chip 并修正光标（不再无反应）。

## 验收场景

### US1
- AC1：选中 skill chip 后序列化文本含 `\u0001skill:name\u0001` 标记
- AC2：提交后服务器把标记内 skill 展开为 `<skill name="..." location="...">` XML（读 SKILL.md，strip frontmatter，附 `References are relative to {baseDir}.`）
- AC3：未知 skill 标记 → 保留原样（`/skill:name` 文本，不抛错）
- AC4：手打文本中的 `/skill:xxx`（无标记）不展开
- AC5：file 标记 `\u0001file:path\u0001` → 发送路径文本（剥标记）

### US2
- AC1：用户气泡中 `<skill ...>` XML 段渲染为 skill chip（✨ 图标 + 名称）
- AC2：文件路径（如 `src/a.ts`）渲染为 file chip（📄 图标）
- AC3：普通文本保持原样（whitespace-pre-wrap）
- AC4：历史回填消息同样渲染

### US3
- AC1：`turn_start` 后 assistant 气泡出现（空 turn + ▍）
- AC2：`message_start:assistant` 不重复创建 turn（复用空 turn）
- AC3：thinking 到来后正常流式（现有行为不变）

### US4
- AC1：光标在 chip 内/紧贴边界时按 Backspace → chip 被删除、光标移到 chip 前
- AC2：正常文本删除行为不变

## FR

- FR-001：chip 标记常量与序列化（chip-serialize 或 mention 模块）：`\u0001skill:{name}\u0001` / `\u0001file:{path}\u0001`；解析函数 `parseChipMarks(text)` 返回段列表
- FR-002：domain 层 `expandSkillChip(text, skillLookup)`（纯函数）：只处理标记段；`stripFrontmatter` + 拼 XML（复刻 pi `_expandSkillCommand` 格式）；未知 skill 原样
- FR-003：rpc-handler `pi:sendMessage`：文本经 `expandSkillChip`（skill 元数据来自 `state.api.getCommands()` 的 skill 命令 `sourceInfo.path/baseDir`）→ `sendUserMessage(展开后)`
- FR-004：渲染函数 `renderUserContent(text)`（纯函数）：解析 XML skill 段 + 路径正则 → 段列表（chip/文本）；Chat.tsx 用户气泡接入
- FR-005：stream.ts `turn_start` 创建空 turn（steps 空、final false）；`message_start:assistant` 复用最后空 turn
- FR-006：Chat.tsx StreamingSteps 空 steps 且 active 时显示 ▍
- FR-007：Backspace 修复（纯函数 + InputBar keydown）：光标在 chip 内 → 删除 chip + 光标移到 chip 前

## 非目标

- 不做手打 `/skill:` 文本展开（只 chips）
- 不做文件内容 XML 展开（文件引用保持路径文本，与 TUI 一致）
- 不改 pi 内核（sendUserMessage expand 行为保持）

## 技术要点

- 标记字符 `\u0001`（SOH，用户输入不可达）；skill 标记 `\u0001skill:name\u0001`、file 标记 `\u0001file:path\u0001`
- skill XML 格式复刻 pi `_expandSkillCommand`（agent-session.js 949-973 行）：`<skill name="{name}" location="{path}">\nReferences are relative to {baseDir}.\n\n{body}\n</skill>`；args（空格后文本）附加在 `</skill>` 后
- 路径正则：`(?:^|[\s，。])([\w./@~-]+\.\w{1,8})(?=$|[\s，。])`——排除 URL（含 `://`）与纯数字
- 用户气泡渲染历史：pi 会话存储的是展开后文本（XML + 路径）→ 渲染函数统一处理实时与历史
- 展开只在服务器端（rpc-handler），skill 文件读取不暴露到前端
