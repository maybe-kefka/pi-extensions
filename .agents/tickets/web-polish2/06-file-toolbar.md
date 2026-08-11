# 06 — 文件视图工具栏（保存/撤销/重做/重新加载）

**What to build:** EditorPane 标题栏变 vscode 风格工具栏：保存（dirty 时显示——调用内部 save）、撤销/重做（CodeMirror dispatch）、重新加载（确认后丢弃未保存改动从磁盘重读）；Ctrl+S 从 TabsBar/App 迁移到 EditorPane；TabsBar 移除保存按钮（onSave prop 清理）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] EditorPane 工具栏按钮（保存 dirty 显隐/撤销/重做/重新加载）
- [ ] Ctrl+S 在 EditorPane 生效；TabsBar 无保存按钮（测试更新）
- [ ] 冒烟：文件编辑 → 工具栏保存 ✓ 撤销/重做 ✓ 重新加载 ✓ tab 栏无保存 ✓
