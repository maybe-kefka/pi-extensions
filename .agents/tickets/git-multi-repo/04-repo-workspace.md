# 04 — repo 展开区：工作区变更 + stage/commit

**What to build:** repo 项展开体：工作区变更分两区（未 staged / 已 staged，文件行 + stage/unstage 按钮 + 区头"全部"操作）；有可提交文件时展开区顶部显示 commit textarea（2 行，Ctrl+Enter/提交按钮）——有 staged 直接提交 staged；无 staged 时点击提交弹确认（提交全部工作区文件）后提交；提交/暂存后刷新该 repo 状态与 brief 徽标；展开区点击文件行 → 打开文件 tab（permanent，入口供 06 diff 挂接）。

**Blocked by:** 03 — 多仓库发现 + git 面板 repo 列表

**Status:** ready-for-agent

- [ ] 两区渲染与 stage/unstage/全部操作真实生效（git 验证）；提交 staged 正常；无 staged 确认后提交全部
- [ ] 提交后 staged 清空 + brief 徽标刷新；展开时拉取（折叠再展开重拉）
- [ ] 组件测试（两区/按钮/禁用态/确认弹窗）；冒烟：改文件 → stage → commit → 验证

