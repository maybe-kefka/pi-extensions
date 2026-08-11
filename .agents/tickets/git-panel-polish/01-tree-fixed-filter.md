# 01 — 文件树固定过滤

**What to build:** 文件树删除"排除项/隐藏项"两个开关与相关状态概念；目录浏览固定显示所有文件（含 .env、node_modules、dist、.pi），仅 .git 目录隐藏。用户不再需要手动切换即可看到真实目录结构（vscode explorer 语义）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 服务端 listDir 固定跳过 .git，其余（隐藏文件、node_modules 等）全部返回；ListDirOptions 不再有 showExcluded/showHidden 字段
- [ ] 客户端树状态机删除 showExcluded/showHidden/setShowOptions；FilesTree 删除两个 toggle 按钮与"默认过滤"状态提示
- [ ] listDir 单测：.env 与 node_modules 显示、.git 隐藏；tree 状态机用例改写后全绿
- [ ] npm test + typecheck 全绿
