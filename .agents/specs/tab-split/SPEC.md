# SPEC：tab 分区分裂（split view）

## Problem Statement

web 控制台主区只有单组 tab（`tabs[]` 扁平数组 + 全局 `active`）：同时只能看一个文件/会话，无法并排对比两个内容。用户期望 VSCode 式拖拽分区：把 tab 拖到主内容区即可把可用空间一分为二，每区独立管理自己的 tab 组，且分区边界可拖动调整占比。

## Solution

主区支持**递归二分 split**：

- 拖任意 tab（文件/diff/chat）到主内容区 → 出现**十字高亮**（中央 + 四边），悬停左/右/上/下边缘决定分区方向 → drop 后目标区一分为二，**被拖 tab 移入新组**（新组初始只有它自己），原组移除该 tab
- 每个分区是**独立的 tab 组**（独立 tab 栏 + 独立激活 tab）；拖 tab 到另一组的 tab 栏 = 跨组移动
- 分出的区**可继续再分**（递归二分，任意深度）
- **split 边界可拖动**调整占比（最小尺寸约束）
- 组内 tab 全部关闭/移走后**自动合并**（分区消失，空间归邻居）
- **localStorage 持久化**：刷新恢复分区结构 + 各组 tab（chat 会话不存在显示 dead 态，可手动复活）
- 无分区时（单组）行为与现在完全一致

## User Stories

1. 作为用户，我想把 tab 拖到主内容区右侧放下，以便左右并排看两个内容
2. 作为用户，我想把 tab 拖到主内容区左侧/上侧/下侧放下，以便按任意方向分区
3. 作为用户，我想拖拽时有清晰的十字高亮提示（中央 + 四边，悬停处高亮），以便预知分区方向
4. 作为用户，我想分区后每个区有独立的 tab 栏，以便每区打开多个 tab
5. 作为用户，我想每区独立记住自己的激活 tab，以便切换 A 区内容时 B 区不受影响
6. 作为用户，我想把 tab 拖到另一区的 tab 栏（tab 间隙/末尾）加入该区，以便跨组移动
7. 作为用户，我想同组内拖 tab 调序（现有行为保留），以便组织阅读顺序
8. 作为用户，我想拖 chat tab 分区，以便并排对比两个会话（spawn 多实例双活；TUI 单实例时非聚焦区显示历史、收不到实时流——降级可接受）
9. 作为用户，我想拖 split 边界调整两区占比，以便按需分配空间
10. 作为用户，我想边界拖动有最小尺寸约束，以便分区不会被拖没
11. 作为用户，我想关掉某组最后一个 tab 后分区自动合并，以便布局不残留空区域
12. 作为用户，我想刷新页面后分区结构 + 各组 tab 恢复，以便继续上次的工作布局
13. 作为用户，我想恢复时 chat 会话若已不存在显示 dead 态并可手动复活，以便不丢会话入口
14. 作为用户，我想从会话管理/文件树打开的 tab 进入最后交互的分区（聚焦区），以便打开位置符合直觉
15. 作为用户，我想 agent 新注册的会话 tab 打开到聚焦区、会话离开时从所在组移除，以便分区与真实进程状态一致
16. 作为用户，我想无分区（单组）时所有现有行为不变，以便不破坏既有工作流
17. 作为用户，我想 diff tab 与文件 tab 一样可分区、可跨组移动，以便对比两个 diff

## Implementation Decisions

- **数据模型**（原型，来自对齐共识——递归树，每次拖拽只二分目标叶子）：

  ```ts
  type SplitDir = "row" | "col"; // row=左右, col=上下
  type LayoutNode =
    | { kind: "split"; dir: SplitDir; ratio: number; a: LayoutNode; b: LayoutNode }
    | { kind: "leaf"; groupId: string; tabs: WorkspaceTab[]; active: string };
  ```

  ratio 为 a 的占比（0-1，clamp 到 [MIN_RATIO, 1-MIN_RATIO]）；单组 = 单 leaf（与现有 `WorkspaceState` 语义等价，现有 tabs.test.ts 37 用例保持回归）。

- **核心逻辑纯函数模块**（S1 seam，entities/workspace 层）：
  - 树操作：`splitGroup(tree, groupId, dir, tabId)`（二分叶子，被拖 tab 移入新叶子）/ `moveTabToGroup(tree, fromGroupId, toGroupId, tabId, index?)` / `closeTabInGroup` / `activateInGroup` / `setSplitRatio(tree, splitId, ratio)` / `removeEmptyLeaf`（空组自动合并：父 split 提升兄弟）
  - **drop 判定**：`resolveDropZone(rect 归一化坐标, 命中叶子, 容差阈值) → { groupId, dir } | null`——十字高亮的方向判定纯函数（边缘阈值 ~20% + 中央回退）
  - 序列化：`serializeTree / deserializeTree`（含各组 tabs+active+ratio；版本字段 + 损坏/旧格式兜底为单空 leaf）
  - 现有 tabs.ts 的 open/close/activate/rename/dirty/promote 等操作按组路由（目标 = 聚焦组；无分区时 = 单组，行为不变）
- **渲染**：主区递归组件（S2 seam）：split 节点 → flex row/col 容器 + 可拖 divider（pointer 事件更新 ratio）；leaf 节点 → 现有 TabsBar + 内容区（chat/file/diff 渲染逻辑参数化 groupId——**常驻挂载模式不变**：所有 tab 组件仍全局挂载、hidden 显隐，分区只决定可见组渲染位置）
- **聚焦区**：App 状态记录最后交互的组 id（点击 tab / 拖入 / 打开内容的落点）；外部打开（会话管理点击、文件树打开、diff、agent join）→ 聚焦区；从未交互 → 第一组
- **会话切换**：现有"激活 chat → 切换 TUI 进程会话"effect 改为跟随**聚焦区的激活 chat**
- **agent 生命周期**：join → 聚焦区开 chat tab；leave → 从所在组移除（空组合并兜底）
- **交互状态**（组件内）：拖拽中高亮（dragOver 归一化坐标 → resolveDropZone → 高亮层渲染）、divider 拖动（pointer capture）
- **持久化**：localStorage 独立键（与 panel width 键分开），版本化，deserialize 校验
- 不引入任何新运行时依赖（保持"运行时依赖仅 @earendil-works/pi-tui"约束）

## Testing Decisions

- **好测试的标准**：只测外部行为（树状态迁移结果、DOM 结构、回调触发），不测内部实现细节
- **S1**：split-tree 纯函数测试——树操作（二分/跨组移动/激活/比例 clamp）、空组合并（递归提升）、序列化（round-trip、损坏数据兜底、版本迁移）、resolveDropZone（边缘/中央/边界阈值）——先例：entities/workspace/tabs.test.ts（37 it 纯函数）、layout.test.ts
- **S2**：主区渲染组件测试——树 → DOM 结构断言（row/col 容器存在、各组 tab 正确）；jsdom DnD（fireEvent dragStart/drop：拖 tab 到 drop zone → onSplit 回调参数正确；拖到 tab 栏 → onMoveToGroup）；divider 拖动 → onRatio——先例：features/editor-tabs/TabsBar.test.tsx（已有 fireEvent DnD 先例）
- **回归**：现有 tabs.test.ts 37 用例 + 组件测试全绿（单组行为不变）
- **冒烟**：浏览器实测拖拽分区/边界拖动/刷新恢复（E2E 只冒烟，不做自动化——合成 DnD 在真实浏览器不可靠的既有教训）

## Out of Scope

- 三/四分、非二分的自由拖拽布局（每次拖拽只二分目标区）
- 浮动窗口/拖出主区成独立窗口
- 拖拽悬停自动切换（VSCode 的悬停 800ms 自动分区——只在 drop 时分区）
- 键盘导航（方向键切分区）、无障碍拖拽
- 拖拽过渡动画/视觉润色
- 侧边栏/活动栏与分区联动（侧边栏保持全局单一）
- 触屏拖拽

## Further Notes

- 纯自研（零新依赖）是用户明确选型（C 方案）：chat 常驻挂载架构与 dock 库的 panel 卸载模型冲突，自研风险最低
- 现有渲染模式（全部 tab 常驻挂载 + hidden 显隐）是 chat 流式/输入状态不丢的基础——分区实现不得破坏该模式
- localStorage 恢复的 chat dead 态复用现有 markChatDead/onRevive 兜底
