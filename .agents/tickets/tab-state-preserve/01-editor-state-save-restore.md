# 01 — EditorPane 编辑器状态上报与恢复（组件内）

**What to build:** EditorPane 接收 `savedState`（EditorSnapshot：edit/selection/scrollTop）与 `onStateSave`：挂载时用 savedState.edit 初始化 reducer（内容/哈希/脏标记整体恢复，首次文件加载不覆盖恢复内容）；CodeMirror `onUpdate` 持续上报快照（edit 读 ref 最新 + 主 selection + 编辑器滚动）；`onCreateEditor` 恢复光标与滚动；卸载兜底上报。保存/冲突检测基于恢复的哈希正常工作。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] savedState.edit 初始化 reducer（内容/脏标记/savedHash 恢复）
- [ ] 首次 loadFile 不覆盖恢复内容（readFile 返回不同内容时 value 保持恢复值；"重新加载"按钮不受影响）
- [ ] 编辑输入 → onStateSave 持续收到含最新 content 的快照
- [ ] onCreateEditor 恢复 selection 与 scrollTop（mock 下验证调用路径，真实行为冒烟）
- [ ] 恢复后保存 → 冲突检测用恢复的 savedHash（mock writeFile conflict 断言）
- [ ] 全量测试绿：npm test + typecheck
