# 03 — 多仓库发现 + git 面板 repo 列表

**What to build:** 服务端 `discoverRepos`（递归扫描 cwd 下 `.git`，深度 ≤4，跳过 node_modules/.git 与隐藏目录，嵌套 repo 独立，cwd 自身优先）+ `repoBrief`（branch + `git status -sb` 解析 ahead/behind）+ 新增 `pi:gitRepos` RPC；现有 git RPC 全部加可选 `repoRoot` 参数 + **服务端白名单校验**（repoRoot 须 cwd 内且存在 .git，否则拒绝）。前端 GitPanel 重构为 repo 列表：无仓库显示"未找到 git 仓库"；每项 brief 行（展开箭头 + 仓库名 + 分支 + ↓ahead/↑behind 徽标 + 刷新按钮 + ⋮ 按钮）——折叠态可点 ⋮ 无操作占位。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] discoverRepos 单测（假 fs：单/多/嵌套/深度超限/排除/无）；repoBrief 单测（假 runner：ahead/behind 解析各形态）；repoRoot 白名单单测（合法/越权/无 .git）
- [ ] pi:gitRepos 返回正确列表；git RPC repoRoot 生效且越权拒绝
- [ ] GitPanel repo 列表渲染（多项/空态/brief 徽标/刷新重扫）；组件测试
- [ ] `npm test` + `npm run typecheck` 全绿；冒烟：临时多 repo 目录（2 个 repo + 无 repo 目录）三态验证

