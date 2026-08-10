# 01 — tab 系统（多文件 tab + 聊天 tab）

**What to build:** 顶部 tab 条上线：文件 tab（每打开一个文件一个 tab，独立编辑状态）+ 聊天 tab（标签显示当前会话名，常驻不可关闭）；点击 tab 切换视图；文件 tab 可关闭；内容区随激活 tab 切换（文件 = 编辑器，聊天 = Chat + InputBar）。前端新增 workspace tab 状态机（纯函数：open/close/activate/dirty 流转/会话名跟随），EditorPane 按 tab 实例化（key=path 独立状态），App 移除旧 view 状态与 Header 视图切换按钮。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 多文件 tab 打开/切换/关闭（独立编辑状态不串扰）；聊天 tab 标签=当前会话名且常驻
- [ ] tab 状态机纯函数单测（打开去重/关闭/激活/聊天跟随）；TabsBar 组件测试
- [ ] 旧 view 切换（Header 文件/会话按钮）移除，无残留引用
- [ ] `npm test` + `npm run typecheck` 全绿；浏览器冒烟：打开多文件 + 切换 + 关闭

