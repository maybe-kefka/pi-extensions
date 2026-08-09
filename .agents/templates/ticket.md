# TICKET-<pkg>-<迭代>-<序号>-<slug>

> **生命周期**：草稿在 `.scratch/R<迭代号>/issues/`（gitignore）→ 完成后归档 `.agents/tickets/<pkg>/TICKET-<pkg>-<迭代>-<序号>-<slug>.md`（至少保留到任务完成/归档）。
> 参照 spec-kit tasks 格式：`[ID] [P] [Story] 描述`（P=可并行，Story=所属 User Story）。

**迭代**：R<迭代号>
**所属 User Story**：US<n>
**前置**：<依赖的 ticket / 基线 SPEC 章节>
**状态**：open / in-progress / done

## 任务

- <具体任务描述，含精确文件路径>
- <子步骤…>

## TDD

- 先写失败测试：`<文件路径>`（+N 测试，红）
- 实现：`<文件路径>`
- 验证：`npm test`（全绿）+ `npm run typecheck`（0 error）

## 验收

- [ ] 测试全绿
- [ ] typecheck 0 error
- [ ] 冒烟/人工验证要点
