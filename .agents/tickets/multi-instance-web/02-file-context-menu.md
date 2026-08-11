# 02 — 文件右键菜单

**What to build:** 文件树行 hover 操作按钮移除，改为右键菜单（radix context-menu）：打开 / 打开 diff / 重命名 / 删除 / 新建文件 / 新建目录 / 复制路径。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 新增 @radix-ui/react-context-menu 依赖（运行时依赖先例：radix 生态）
- [ ] 文件行右键弹菜单，七项齐全且回调正确（打开=正式打开；打开 diff=open-diff；复制路径=clipboard）
- [ ] 行内 hover 操作按钮移除（TreeView 无残留行内按钮）
- [ ] 组件测试覆盖菜单项回调；npm test + typecheck 全绿
