# 05 — split 边界拖动 + 最小比例

**What to build:** Split 节点的 divider 可拖动调整两区占比：pointer 拖动实时更新 ratio（clamp 到最小尺寸约束——约 160px 换算的比例下限），松手定稿；无分区/单组时无 divider。
**Blocked by:** 02

**Status:** ready-for-agent

- [ ] setSplitRatio 纯函数：ratio clamp（[MIN, 1-MIN]，MIN 由像素→比例换算）；嵌套 split 各层级独立可调
- [ ] divider 拖动接线：pointer 事件（pointerdown/move/up + capture）实时更新；jsdom 测试（拖动 → onRatio 回调参数正确）
- [ ] 浏览器冒烟：左右/上下分区拖边界调占比，拖到极限后停止（分区不消失）
