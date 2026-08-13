# 03 — 根治滚动条闪烁：移除 autoscroll 滚动条隐藏

**What to build:** 聊天滚动容器在 autoscroll（跟随底部）期间不再隐藏滚动条——移除 `data-autoscrolling` 挂钩的滚动条隐藏样式，滚动条常显 thin。split 宽度变化引发的反复 autoscroll 不再产生"消失 180ms 又加回"的视觉闪烁。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 滚动容器样式不再随 autoscrolling 属性切换滚动条可见性
- [ ] 浏览器冒烟：split 后聊天区滚动条稳定、无闪烁；流式输出时滚动条常显
- [ ] 既有测试全绿：npm test + typecheck
