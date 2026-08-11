# 07 — popover 管理区只列本地分支

**What to build:** popover 分支管理区（合并/rebase/删除）数据源切到新接口的本地 branches 字段——远程分支不出现，避免误导性管理操作。

**Blocked by:** 05 — 分支数据底座

**Status:** ready-for-agent

- [ ] popover 分支列表只渲染本地分支（remotes 不出现）
- [ ] 切换/merge/rebase/删除原有行为与确认流程不变
- [ ] npm test + typecheck 全绿
