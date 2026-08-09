# 迭代规格：R<迭代号> — <特性名>

> **生命周期**：草稿在 `.scratch/R<迭代号>/SPEC.md`（gitignore）→ 迭代完成落盘 `.agents/specs/R<迭代号>/SPEC.md`（长期保存）。
> 参照 spec-kit（github/spec-kit）spec-template 结构 + 敏捷（每次迭代 = 可独立验收的增量）。
> 生成方式：用户提出需求 → 逐题对齐（grilling）→ 落盘本文件 → 拆 tickets → TDD。

**迭代**：R<迭代号>
**创建日期**：<YYYY-MM-DD>
**状态**：Draft / Approved / Done
**所属包**：@kefka/pi-<pkg>
**输入**：用户需求描述（原始话语）
**基线引用**：涉及既有系统规格时写"基线 SPEC §X"（`.agents/specs/<pkg>/SPEC.md`），不复述。

## 目标

一句话说明本次迭代要解决的问题 / 交付的价值。

## User Stories（按优先级 P1/P2/P3 排序，每故事独立可测）

### User Story 1 - <标题>（Priority: P1）

<用用户语言描述该用户旅程；说明为什么是最高优先级>

**独立验收**：<如何单独测试并交付价值——实现这一个故事就应有可用 MVP 增量>

**验收场景**：

1. Given <初始状态>，When <动作>，Then <预期结果>
2. Given <初始状态>，When <动作>，Then <预期结果>

### User Story 2 - <标题>（Priority: P2）

...

## Edge Cases

- <边界条件 / 异常场景 / 失败路径>

## 功能需求

- **FR-001**：系统 MUST <具体能力>
- **FR-002**：系统 MUST <具体能力>
- 待澄清项标 `[NEEDS CLARIFICATION: ...]`

## 非目标

- 本次迭代明确不做的事（防范围蔓延）

## 技术方案要点（可选）

- <关键实现决策、数据模型变更、架构影响；细节留在 ticket>
