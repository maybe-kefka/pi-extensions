# 06 — 分支选择弹窗

**What to build:** 点击 repo 行分支名徽标弹出分支选择 Dialog（alert 样式）：顶部输入框实时过滤列表 + 本地/远程分组列表（当前分支标记不可点，点本地分支即切换，点远程分支走 switchOrTrack）；输入不存在的名字回车 → 弹窗内联展开"从哪个分支创建"（base 单选列表：本地+远程，确认按钮）→ pi:gitCreateBranch 创建并立即切换；成功后 toast + 刷新 brief/展开区状态 + 关闭弹窗。

**Blocked by:** 05 — 分支数据底座

**Status:** ready-for-agent

- [ ] 分支名徽标可点击（cursor-pointer + title），点击弹 Dialog
- [ ] 弹窗内输入框过滤列表；本地/远程分组渲染；当前分支 Check 标记且不可点
- [ ] 点本地分支 → pi:gitSwitch 调用 + 弹窗关闭 + 刷新
- [ ] 点远程分支 → switchOrTrack 对应 RPC（pi:gitSwitch 传远程名或新 RPC 语义）调用
- [ ] 输入新名回车 → 内联"从哪个分支创建"（base 列表 + 确认）→ pi:gitCreateBranch → 创建并切换 + toast
- [ ] GitPanel 组件测试覆盖上述交互；npm test + typecheck 全绿
