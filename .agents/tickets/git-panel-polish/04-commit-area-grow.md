# 04 — commit 框一行可变高 + 触发键

**What to build:** commit 输入框默认一行（rows=1），内容增加时按内容自动变高（auto-grow）；Enter = 换行（textarea 默认）、Shift+Enter 与 Ctrl/Meta+Enter = 提交；提交按钮保留。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 输入框初始一行，多行内容时高度随内容增长（无横向滚动）
- [ ] Shift+Enter 触发提交（提交逻辑不变）；Enter 不触发提交（换行）
- [ ] npm test + typecheck 全绿
