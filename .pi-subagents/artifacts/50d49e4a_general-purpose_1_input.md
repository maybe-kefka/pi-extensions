# Task for general-purpose

你是一轴代码审查员（Spec 轴）。仓库：/data/data/com.termux/files/home/projects/pi-extensions。

审查对象：`git diff 276b403...HEAD`（基点 276b403 = pi-notify-termux 包开发前）。提交清单：4ce9e25, f7eafe1, e014929, 4396177, 55fdab0, 78e8a18, 85f2ec7, cf1a14f, 2d87fa0, ed4a9b1, e78c8a5, 90f2e07, 995c5f2。

规格来源（先读全文）：
- /data/data/com.termux/files/home/projects/pi-extensions/docs/pi-notify-termux/SPEC.md（权威需求，含已确认决策表 D1-D10、架构、模块划分、行为语义 §5、验收要点 §6）
- /data/data/com.termux/files/home/projects/pi-extensions/docs/pi-notify-termux/TICKETS.md（任务清单 + 实现中发现的偏差记录——注意 SPEC 在开发中随实测演化过：需求 3 focus 检测被砍（D1）、终结反馈方案经历 remove→替换→分场景+自动消失的演变）

实现代码：packages/pi-notify-termux/src/*.ts（index.ts 薄接线 + 6 个纯函数模块）与 test/*.ts。

报告要求（400 词内，中文）：(a) SPEC 要求但缺失/部分实现的需求；(b) diff 中 SPEC 没要求的行为（范围蔓延）；(c) 看似实现但实现疑似错误的需求——每项引用 SPEC 原文行。注意评估：SPEC 是否被实现反过来'改'到失真（比如 D1 砍需求、终结反馈演变是否都忠实记录在案）；tool 参数与 SPEC §5.2 一致性；/notify 行为与 §5.3 一致性；轮询/文件桥与 §4/§5.4 一致性。

---
**Output:**
Write your findings to exactly this path: /data/data/com.termux/files/home/projects/pi-extensions/.pi-subagents/artifacts/outputs/50d49e4a/spec-report.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

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