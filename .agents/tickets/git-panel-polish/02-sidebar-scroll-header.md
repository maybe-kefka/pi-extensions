# 02 — 侧边栏独立滚动 + header 对齐

**What to build:** 文件/git 侧边栏内容展开不再溢出面板——各自独立滚动（与会话/设置面板一致）；文件面板 header 与主区 tab 栏高度统一 36px；git 面板新增"源代码管理"标题行（icon + 标题，与文件面板同高对齐）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 文件/git 面板容器具备独立滚动（scrollbar-thin + overflow-y-auto，h-full min-h-0）
- [ ] 文件面板 header 高度与 tab 栏（36px）一致；git 面板有"源代码管理"标题行且同高
- [ ] 组件测试不回归；npm test + typecheck 全绿
