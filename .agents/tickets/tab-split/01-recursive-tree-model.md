# 01 — 递归树模型 + 单组等价渲染

**What to build:** 主区 tab 管理从扁平数组迁移到递归分区树结构（`Split(dir,ratio,a,b) | Leaf(groupId,tabs,active)`），但暂不暴露任何分区能力：整棵树始终只有单个 leaf，渲染结果与现在完全一致。树结构支持序列化骨架（round-trip 可测）。这是后续所有分区能力的承载结构——先立结构、行为不变。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 树类型（split/leaf）与现有 WorkspaceTab/active 语义等价；单 leaf 时所有现有操作（打开/关闭/激活/调序/改名/dirty/promote/chat dead）行为与扁平数组完全一致（现有 37 个纯函数用例全绿）
- [ ] 主区渲染改为按树递归渲染：单 leaf = 现在的 TabsBar + 内容区（chat/file/diff 常驻挂载 + hidden 显隐模式不变），视觉与交互无任何变化
- [ ] 序列化骨架：树 ↔ JSON 双向转换，单 leaf round-trip 测试通过；损坏输入兜底为单空 leaf
- [ ] npm test + typecheck 全绿

# 02 — 拖拽分区（splitGroup + 十字高亮 + drop）

**What to build:** 从主区拖出任意 tab（文件/diff/chat）到主内容区：拖动时出现十字高亮（中央 + 四边），悬停左/右/上/下边缘高亮对应方向；drop 后目标 leaf 一分为二（被拖 tab 移入新 leaf——新组初始只有它自己，原组移除该 tab），Split 节点渲染为左右（row）或上下（col）两个容器 + 静态 divider。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] splitGroup 纯函数：二分目标 leaf、被拖 tab 移入新 leaf、原组移除；对已是 split 的节点拖拽 = 在其子 leaf 上操作（递归）
- [ ] resolveDropZone 纯函数：归一化坐标 → { 目标 leaf, 方向 } | null（边缘阈值 + 中央回退，四方向齐全）；jsdom 测试覆盖边缘/中央/边界
- [ ] 拖拽接线：TabsBar tab 可拖出（复用现有 DnD）→ 进入主区显示十字高亮（高亮层组件）→ drop 触发分区；jsdom DnD 测试（fireEvent：拖 tab → drop zone → 回调参数正确）
- [ ] Split 节点渲染：row/col flex 容器 + 静态 divider（暂不可拖）
- [ ] 浏览器冒烟：真实拖拽分区（左右/上下）成功，新组只有被拖 tab

# 03 — 分区 tab 组逻辑（独立 tab 栏 + 跨组移动 + 空组合并）

**What to build:** 每个分区成为真正独立的 tab 组：独立 TabsBar（各显示自己的 tabs + 自己的激活 tab）+ 独立内容区（chat/file/diff 按组渲染，常驻挂载模式不变）；tab 拖到另一组的 tab 栏 = 跨组移动（加入该组）；组内关闭最后一个 tab → 空组自动合并（父 Split 提升兄弟，递归到单组）；同组拖拽调序行为保留。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] moveTabToGroup / activateInGroup / closeTabInGroup 纯函数：跨组移动（带插入位置）、组内独立激活、组内关闭；空组自动合并（父 split 提升兄弟，多级嵌套递归正确）
- [ ] 每 leaf 渲染独立 TabsBar + 内容区：各组 tabs/active 互不影响；chat/file/diff 内容按组渲染（一个 chat 在 A 组显示时 B 组的文件同时可见）
- [ ] 拖到 tab 栏的 DnD 判定：同组 = 调序（现有行为）；跨组 = 移动；jsdom 测试覆盖两种落点
- [ ] 组内关闭/拖空后分区自动消失，剩余空间归邻居（组件级断言树结构变化）
- [ ] 浏览器冒烟：左右分区各开多 tab、跨组拖 tab、关空自动合并

# 04 — 聚焦区 + 外部打开路由 + agent 生命周期

**What to build:** 引入"聚焦区"（最后交互的分组）：会话管理点击会话、文件树打开文件、打开 diff、agent 新注册会话——这些外部打开的 tab 进入聚焦区（从未交互时 = 第一组）；agent 离开时从所在组移除（空组合并兜底）；"激活 chat 切换 TUI 进程会话"effect 改为跟随聚焦区的激活 chat。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] 聚焦区状态：点击任意组 tab / 拖入 tab 更新聚焦区；外部打开（会话管理/文件树/diff/agent join）落点 = 聚焦区；从未交互 = 第一组
- [ ] agent join → 聚焦区开 chat tab；agent leave → 从所在组移除（含 dead 保留逻辑不回归）
- [ ] 会话切换 effect 跟随聚焦区激活 chat（TUI 单实例切换语义保持）
- [ ] 纯函数 + 组件测试覆盖路由逻辑；现有 agent 生命周期用例回归绿

# 05 — split 边界拖动 + 最小比例

**What to build:** Split 节点的 divider 可拖动调整两区占比：pointer 拖动实时更新 ratio（clamp 到最小尺寸约束——约 160px 换算的比例下限），松手定稿；无分区/单组时无 divider。

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] setSplitRatio 纯函数：ratio clamp（[MIN, 1-MIN]，MIN 由像素→比例换算）；嵌套 split 各层级独立可调
- [ ] divider 拖动接线：pointer 事件（pointerdown/move/up + capture）实时更新；jsdom 测试（拖动 → onRatio 回调参数正确）
- [ ] 浏览器冒烟：左右/上下分区拖边界调占比，拖到极限后停止（分区不消失）

# 06 — localStorage 持久化 + 恢复

**What to build:** 分区布局全量持久化：分区结构 + 各组 tabs（含 active）+ 各层 ratio 序列化到 localStorage（独立键、版本化）；刷新页面恢复完整布局——chat 会话已不存在时显示 dead 态可手动复活（复用现有兜底）；损坏/旧格式数据兜底为单空 leaf。

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] serialize/deserialize 全量：round-trip（多级嵌套 + 多组 tabs + ratio）；损坏数据/旧格式 → 单空 leaf 兜底；版本字段
- [ ] 加载接线：App 初始化读 localStorage 恢复树；保存时机（树变化后持久化）
- [ ] 恢复的 chat tab 会话不存在 → dead 态 + 可复活（现有 markChatDead/onRevive 路径复用）
- [ ] 浏览器冒烟：分区 + 各组 tab + 比例 → 刷新 → 完整恢复
