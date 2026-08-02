# Task for delegate

Two-axis code review — SPEC axis — for the repository at /data/data/com.termux/files/home/projects/pi-extensions (@kefka/pi-status, a pi coding-agent extension implementing the /status context-usage panel as a widget).

Review the ENTIRE repo history (14 commits T0..T10). The fixed point is the empty tree; run this in the repo root:
  git diff 4b825dc642cb6eb9a060e54bf8d69288fbee4904 HEAD
Commit list:
  ae10472 T10: YAML resource blocks + auto-collapse on next input
  715786e T9: revert to widget approach
  e79ac17 T8 fix: replay-before-restore ordering
  b5e010b T8: single-entry replacement semantics
  cb13374 T7 fix: percent double-multiply + full panel
  c654eb3 chore: untrack session.json
  54ca839 T7: chat entry rendering
  2dac0b8 T5+T6: overlay full panel
  6657fb7 T5: index.ts wiring
  da0c415 T4: resources aggregation
  3e43a16 T3: mcp-config discovery
  f24336c T2: context breakdown
  b29101e T1: format pure functions
  f24f5dd T0: repo skeleton
Use bash to run the diff and read the spec files.

SPEC SOURCE (authoritative):
- /data/data/com.termux/files/home/projects/pi-extensions/SPEC.md (read it fully)
- /data/data/com.termux/files/home/projects/pi-extensions/TICKETS.md (acceptance criteria per ticket)

SCOPE: packages/pi-status/** (src + test). NOTE: the implementation deliberately went through design iterations T5–T10 (overlay → chat entries → widget); earlier approaches were replaced and are historical. Judge the code against the CURRENT SPEC.md (widget approach, YAML resource blocks, input auto-collapse). Also verify consistency between SPEC.md and TICKETS.md acceptance criteria.

BRIEF: Report (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words.

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