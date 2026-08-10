# 02 — 侧边栏宽度拖拽 + 持久化

**What to build:** activity bar 面板（aside）右侧边缘拖拽手柄：按下拖动实时调宽（200–480px 夹取），mouseup 持久化到 localStorage（与 theme 偏好同一机制）；刷新后恢复宽度。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 拖拽调宽（夹取 200–480）实时生效；松开持久化；刷新恢复
- [ ] 持久化纯函数单测（localStorage mock：读写/夹取/缺省 260）
- [ ] 冒烟：拖拽 → 刷新 → 宽度保持

