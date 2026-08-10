# 04 — 内联 git diff 视图

**What to build:** 打开文件时显示该文件 vs HEAD 的 diff：行级标记（新增绿 / 删除红 / 上下文灰，从 unified diff 解析为结构化 DiffHunk[] 渲染）；保存成功后自动刷新；文件无改动显示"无改动"占位。服务端新增 unified diff 解析纯函数与 `pi:gitDiff` RPC（单文件 `git diff HEAD -- <path>`，白名单内）；非 git 目录返回 isRepo:false 降级。

**Blocked by:** 02 — 编辑保存（防抖 + 脏标记 + 冲突检测）、03 — git 状态条（repo 识别 + worktree 标记）

**Status:** ready-for-agent

- [ ] 打开有改动的文件显示行级 diff；无改动/非 git 有正确占位
- [ ] 保存后 diff 自动刷新（含：外部冲突选择"覆盖"后刷新为新内容 diff）
- [ ] diff 解析单测（hunk 头 / 增删 / 上下文 / `\ No newline` 尾标记）；前端行映射纯函数单测
- [ ] `npm test` + `npm run typecheck` 全绿；浏览器冒烟：真实仓库改文件 → diff 显示 → 保存 → 刷新

