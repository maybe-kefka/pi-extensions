# 03 — activity bar 布局重构（四面板 + 聊天全宽）

**What to build:** vscode 式布局：最左 activity bar（文件浏览/git 控制/会话管理/设置 4 个图标竖排，点击展开对应面板、再点收起、点另一图标切换）；面板区 260px；文件浏览面板 = 现文件页目录树（编辑器留在主区 tab 内）；会话管理面板 = 现侧栏会话列表与操作（新建/复制/重命名/删除/查看树/降级提示）平移；设置面板 = 模型/思考级别/主题平移；原右侧 Sidebar 整体移除，聊天区全宽（InputBar 保留）；Header 保留（连接/上下文/折叠按钮）。

**Blocked by:** 01 — tab 系统（多文件 tab + 聊天 tab）

**Status:** ready-for-agent

- [ ] activity bar 四图标展开/收起/互斥切换；文件/会话/设置三面板功能与现侧栏等价（无功能丢失）
- [ ] 原右侧 Sidebar 移除无残留；聊天区全宽渲染正常（消息区/InputBar/上下文面板）
- [ ] 布局组件测试（面板切换/收起）；冒烟：四面板切换 + 会话操作可用 + 聊天全宽
- [ ] `npm test` + `npm run typecheck` 全绿

