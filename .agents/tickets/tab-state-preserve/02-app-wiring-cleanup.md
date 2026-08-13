# 02 — App 接线：editorStatesRef + 关闭清理

**What to build:** App 层 `editorStatesRef`（按 path 的 EditorSnapshot 持续收集）+ EditorPane 传参（savedState/onStateSave）；tab 关闭时清理 `chatStatesRef` / `chatScrollAnchorsRef` / `editorStatesRef` 对应条目（chat 按 sessionId、editor 按 path）——重开同会话/同文件从干净状态开始，不被陈旧快照污染。

**Blocked by:** 01 — editor-state-save-restore（EditorPane 接口就绪）

**Status:** ready-for-agent

- [ ] editorStatesRef + handleEditorStateSave + EditorPane 传参（现有渲染处）
- [ ] chat tab 关闭 → 清理 chatStatesRef / chatScrollAnchorsRef 条目
- [ ] file tab 关闭 → 清理 editorStatesRef 条目
- [ ] 清理不影响未关闭 tab 的快照（按 key 精确删除）
- [ ] 浏览器冒烟：split 文件 tab → 编辑内容/光标/滚动保留；关闭后重开 → 干净状态（内容从磁盘加载）
- [ ] 全量测试绿：npm test + typecheck
