# 01 — sidebar-session-row

**What to build:** 会话区三处布局修复：刷新按钮回到「会话」标题行（同行两端，不再占第二行）；会话项功能按钮（重命名/查看树/删除）非 hover 零占位、hover 时从右侧以宽度动画展开 3 个按钮；「当前」badge 删除只留高亮底色。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] 「会话」面板标题行：标题左、刷新按钮右（同一行，`data-slot="card-action"` 机制）
- [x] 会话项 hover：3 个按钮从右展开（max-width + opacity 过渡）；非 hover 时按钮零占位、会话名完整展示（truncate 不被挤压）
- [x] 「当前」badge 删除；active 会话高亮（bg-accent + font-medium）保留
- [x] 回归：hover 展开后重命名/查看树/删除按钮可点击；会话切换正常
- [x] 冒烟清单 ①②③ + ⑧（浏览器）
