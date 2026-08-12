# 02 — 拖拽分区（splitGroup + 十字高亮 + drop）

**What to build:** 从主区拖出任意 tab（文件/diff/chat）到主内容区：拖动时出现十字高亮（中央 + 四边），悬停左/右/上/下边缘高亮对应方向；drop 后目标 leaf 一分为二（被拖 tab 移入新 leaf——新组初始只有它自己，原组移除该 tab），Split 节点渲染为左右（row）或上下（col）两个容器 + 静态 divider。
**Blocked by:** 01

**Status:** ready-for-agent

- [ ] splitGroup 纯函数：二分目标 leaf、被拖 tab 移入新 leaf、原组移除；对已是 split 的节点拖拽 = 在其子 leaf 上操作（递归）
- [ ] resolveDropZone 纯函数：归一化坐标 → { 目标 leaf, 方向 } | null（边缘阈值 + 中央回退，四方向齐全）；jsdom 测试覆盖边缘/中央/边界
- [ ] 拖拽接线：TabsBar tab 可拖出（复用现有 DnD）→ 进入主区显示十字高亮（高亮层组件）→ drop 触发分区；jsdom DnD 测试（fireEvent：拖 tab → drop zone → 回调参数正确）
- [ ] Split 节点渲染：row/col flex 容器 + 静态 divider（暂不可拖）
- [ ] 浏览器冒烟：真实拖拽分区（左右/上下）成功，新组只有被拖 tab
