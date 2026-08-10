# 06 — diff tab（split 只读）+ 普通文件 tab 纯编辑器

**What to build:** 从 git 面板展开区点击文件 → 打开只读 split diff tab（左 HEAD 版本/右工作区，行级对齐着色，两栏滚动联动）：新增 `pi:gitShowHead` RPC（`git show HEAD:<path>`，白名单内 + repoRoot 校验）；DiffView 改造为 DiffSplitView（`pi:readFile` 工作区 + `gitShowHead` 双数据源）；tabs 状态机加 diff tab 类型（与编辑器 tab 共存，TabsBar split 图标区分）；**EditorPane 移除内嵌 DiffView（普通文件 tab 回归纯编辑器）**。

**Blocked by:** 01 — preview 模型、04 — repo 展开区（点击入口）

**Status:** ready-for-agent

- [ ] gitShowHead RPC 正确返回 HEAD 版本（白名单/repoRoot 校验单测）；DiffSplitView 行对齐渲染（单测/组件测试）
- [ ] diff tab 打开/关闭/共存（与编辑器 tab）；TabsBar 图标区分；只读无保存路径
- [ ] EditorPane 无 DiffView 残留（纯编辑器）；组件测试更新
- [ ] `npm test` + `npm run typecheck` 全绿；冒烟：真实改动 → 展开区点击 → split diff 显示 → 与编辑器 tab 共存

