# Task for general-purpose

你是一轴代码审查员（Standards 轴）。仓库：/data/data/com.termux/files/home/projects/pi-extensions（npm workspaces monorepo）。

审查对象：`git diff 276b403...HEAD`（基点 276b403 = pi-notify-termux 包开发前）。提交清单（12 个）：4ce9e25, f7eafe1, e014929, 4396177, 55fdab0, 78e8a18, 85f2ec7, cf1a14f, 2d87fa0, ed4a9b1, e78c8a5, 90f2e07, 995c5f2。

文档化标准来源（先读）：
- /data/data/com.termux/files/home/projects/pi-extensions/AGENTS.md（根：流程 SPEC→TICKETS→TDD、index.ts 薄接线不单测、类型导入用 import type、发布需用户指示）
- /data/data/com.termux/files/home/projects/pi-extensions/packages/pi-notify-termux/AGENTS.md（包：薄接线、纯函数+TDD、零运行时依赖、实测知识）
- /data/data/com.termux/files/home/projects/pi-extensions/tsconfig.base.json（strict、verbatimModuleSyntax、noEmit）
- 参照包惯例：packages/pi-status/src/index.ts（薄接线层风格）

smell baseline（Fowler, Refactoring ch.3；仓库文档覆盖时以文档为准；工具链已强制的跳过）：
1. Mysterious Name — 名字不揭示用途 → 重命名
2. Duplicated Code — 相同逻辑形状多处出现 → 提取共享
3. Feature Envy — 方法更多访问他物数据 → 移到数据所在
4. Data Clumps — 同组字段/参数反复结伴 → 打包成类型
5. Primitive Obsession — 原始类型代表领域概念 → 建小类型
6. Repeated Switches — 同类型上重复 switch/if 级联 → 多态或共享 map
7. Shotgun Surgery — 一个逻辑改动散落多文件 → 聚合
8. Divergent Change — 一个模块因多个无关原因被改 → 拆分
9. Speculative Generality — 为不存在需求加抽象 → 删除
10. Message Chains — 长链 a.b().c() → 首对象隐藏
11. Middle Man — 纯委托 → 直连
12. Refused Bequest — 继承者忽略大部分父类 → 组合替代

报告要求（400 词内，中文）：per file/hunk 列出 (a) 违反文档化标准处：引用标准文件+规则（硬违规）；(b) baseline smell：命名+引用 hunk（判断项，非硬违规）；区分两者；跳过工具链已强制的。重点看 src/*.ts 与 test/*.ts。

---
**Output:**
Write your findings to exactly this path: /data/data/com.termux/files/home/projects/pi-extensions/.pi-subagents/artifacts/outputs/50d49e4a/standards-report.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return a concise result and residual risks when applicable

Required evidence: manual-notes, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```