# 02 — panel-labels-and-collapse

**What to build:** 「模型 / 思考」与「外观」面板去掉面板标题，每个下拉框左侧加小标签（模型 / 思考 / 主题 / 深浅）；侧栏折叠/展开改为宽度过渡动画（不再瞬间显隐）。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 「模型 / 思考」面板：无标题；模型下拉左侧「模型」label、思考下拉左侧「思考」label（Select 撑满剩余宽度）
- [ ] 「外观」面板：无标题；主题下拉左侧「主题」label、深浅下拉左侧「深浅」label
- [ ] 侧栏折叠/展开：宽度过渡动画（w-72 ↔ w-0 + overflow-hidden），切换图标（PanelLeftClose/Open）照常
- [ ] 回归：模型/思考/主题/深浅下拉选择功能正常；折叠后消息区占满
- [ ] 冒烟清单 ④⑤ + ⑧（浏览器）
