# 03 — 分区 tab 组逻辑（独立 tab 栏 + 跨组移动 + 空组合并）

**What to build:** 每个分区成为真正独立的 tab 组：独立 TabsBar（各显示自己的 tabs + 自己的激活 tab）+ 独立内容区（chat/file/diff 按组渲染，常驻挂载模式不变）；tab 拖到另一组的 tab 栏 = 跨组移动（加入该组）；组内关闭最后一个 tab → 空组自动合并（父 Split 提升兄弟，递归到单组）；同组拖拽调序行为保留。
**Blocked by:** 02

**Status:** ready-for-agent

- [ ] moveTabToGroup / activateInGroup / closeTabInGroup 纯函数：跨组移动（带插入位置）、组内独立激活、组内关闭；空组自动合并（父 split 提升兄弟，多级嵌套递归正确）
- [ ] 每 leaf 渲染独立 TabsBar + 内容区：各组 tabs/active 互不影响；chat/file/diff 内容按组渲染（一个 chat 在 A 组显示时 B 组的文件同时可见）
- [ ] 拖到 tab 栏的 DnD 判定：同组 = 调序（现有行为）；跨组 = 移动；jsdom 测试覆盖两种落点
- [ ] 组内关闭/拖空后分区自动消失，剩余空间归邻居（组件级断言树结构变化）
- [ ] 浏览器冒烟：左右分区各开多 tab、跨组拖 tab、关空自动合并
