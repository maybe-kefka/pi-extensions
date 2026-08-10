# 05 — repo 工具栏 popover（分支/远程/stash）

**What to build:** repo 项 ⋮ 按钮弹 popover 三分区：分支管理（当前分支高亮 + 切换/新建/合并/rebase/删除——05a 功能平移，repoRoot 生效）、远程（push/pull）、stash（push/pop/apply/drop）；操作后刷新该 repo brief 与展开区；确认弹窗（merge/rebase/删除分支）沿用。

**Blocked by:** 03 — 多仓库发现 + git 面板 repo 列表

**Status:** ready-for-agent

- [ ] 三分区渲染与全部操作真实生效（repoRoot 指向正确仓库）；确认弹窗沿用
- [ ] 操作后 brief/展开区刷新；组件测试（分区渲染/操作触发）
- [ ] 冒烟：多 repo 下对指定 repo 做分支/stash/push 操作（git 验证目标仓库）

