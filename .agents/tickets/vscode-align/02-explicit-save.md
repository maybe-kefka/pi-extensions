# 02 — 显式保存模型（Ctrl+S + 保存按钮 + 关闭三选）

**What to build:** 移除 800ms 防抖自动保存：编辑只改内存（dirty 圆点标记）；Ctrl+S（CodeMirror Mod-s keymap）与 tab 条保存按钮（dirty 时出现）显式落盘；关闭 dirty tab 弹三选（保存/不保存/取消）；mtime/hash 冲突检测保留（覆盖/放弃/重新加载）。保存成功后联动刷新（预留 git 状态刷新钩子）。

**Blocked by:** 01 — tab 系统（多文件 tab + 聊天 tab）

**Status:** ready-for-agent

- [ ] 编辑不自动落盘（磁盘不变），dirty 圆点正确流转；Ctrl+S 与保存按钮落盘成功
- [ ] 关闭 dirty tab 三选：保存→落盘后关闭 / 不保存→直接关 / 取消→保持
- [ ] 冲突检测（外部修改后保存）三选仍工作
- [ ] 保存状态机单测改写（移除防抖相关）；组件测试（Ctrl+S/按钮/三选）
- [ ] `npm test` + `npm run typecheck` 全绿；浏览器冒烟：编辑不落盘 → Ctrl+S 落盘 → 关闭三选

