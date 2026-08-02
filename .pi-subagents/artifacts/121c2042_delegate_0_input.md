# Task for delegate

Two-axis code review — STANDARDS axis — for the repository at /data/data/com.termux/files/home/projects/pi-extensions (@kefka/pi-status, a pi coding-agent extension implementing the /status context-usage panel as a widget).

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
Use bash to run the diff and read files (SPEC.md, tsconfig.base.json, packages/pi-status/tsconfig.json, packages/pi-status/src/*, packages/pi-status/test/*).

STANDARDS SOURCES (priority order):
1. SPEC.md §7 (package structure & module responsibilities) — read SPEC.md fully. Key rules: src/index.ts must stay a THIN wiring layer — no business logic, no unit tests; every other src module must be pure functions + unit tests (TDD); type-only imports must use `import type` (verbatimModuleSyntax). SPEC.md also documents data-flow contracts (§2.1 output channels incl. widget approach + input auto-collapse, §4 token accounting incl. chars/4 heuristic and percent normalization, §5 YAML resource blocks).
2. tsconfig.base.json and packages/pi-status/tsconfig.json — compile constraints.
3. ~/.pi/agent/AGENTS.md — run existing lint/typecheck/test after changes.
4. There is NO CODING_STANDARDS.md / CONTRIBUTING.md — fall back to the smell baseline below.

SMELL BASELINE (always applies; a documented repo standard overrides it; each is a labelled judgement call, never a hard violation; skip anything tooling already enforces):
- Mysterious Name — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- Duplicated Code — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- Feature Envy — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- Data Clumps — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- Primitive Obsession — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- Repeated Switches — the same switch/if-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- Shotgun Surgery — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- Divergent Change — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- Speculative Generality — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- Message Chains — long a.b().c().d() navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- Middle Man — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- Refused Bequest — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

BRIEF: Report — per file/hunk where relevant — (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls — documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words.

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