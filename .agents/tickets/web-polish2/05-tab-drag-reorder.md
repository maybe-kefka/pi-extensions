# 05 — tab 拖拽调序

**What to build:** TabsBar 支持拖拽重排任意 tab（file/chat/diff 混合）：moveTab 纯函数（前移/后移/跨类型/非法 id）+ reducer action + HTML5 DnD（draggable/onDragStart/onDragOver 插入指示/onDrop）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] moveTab 单测（前移/后移/跨类型/非法不变）
- [ ] TabsBar 拖拽交互（拖起/悬停指示/放下重排）
- [ ] 冒烟：拖动 tab 换序 ✓
