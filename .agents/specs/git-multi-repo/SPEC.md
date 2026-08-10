# SPEC：git 多仓库 + preview 模型 + diff tab + 侧边栏拖拽（迭代 slug: git-multi-repo）

## Problem Statement

当前 git 面板假设工作区只有一个仓库（基于 cwd），但实际工作区常是父文件夹、其下有多个 git repo（monorepo/多项目目录）——面板无法发现与分别管理；普通文件 tab 内嵌 git diff 视图，与"编辑器"心智混淆；文件打开即 permanent，缺少 vscode 的预览（preview）语义；侧边栏宽度固定不可调。目标是尽量还原 vscode 的 git/文件系统体验。

## Solution

- **多仓库 git 面板**：自动发现 cwd 下的全部 git 仓库（深度 4 层、跳过 node_modules 等排除目录、嵌套 repo 独立）；面板为 repo 列表（无 repo 显示"未找到 git 仓库"）；每项 brief 信息：repo 名 + 分支 + 可 pull 数 ↓ / 可 push 数 ↑ + 刷新按钮 + ⋮ 工具栏（popover 三分区：分支管理 / 远程 push-pull / stash）；点击展开/折叠工作区变更（未 staged / 已 staged 两区 + stage/unstage + commit 输入）。
- **普通文件 tab = 纯编辑器**：移除内嵌 diff 视图。
- **预览模型**：单击文件 = preview（tab 斜体，全局唯一）；双击/Enter = permanent（正体）；编辑 preview 自动转 permanent；从 git 面板打开 = permanent。
- **diff tab**：从 git 面板展开区点击文件 → 打开只读 split diff tab（左 HEAD / 右工作区）；与编辑器 tab 可共存（图标区分）。
- **侧边栏拖拽**：面板边缘拖拽调宽（200–480px），localStorage 持久化（theme 偏好已持久化，同一机制）。

## User Stories

1. 作为 pi-web 用户，我想 git 面板列出工作区下的全部 git 仓库（即使只有一个也以列表呈现），以便分别管理。
2. 作为 pi-web 用户，我想在无仓库时看到"未找到 git 仓库"提示，以便理解面板空态。
3. 作为 pi-web 用户，我想每个 repo 项显示仓库名、当前分支、可 pull/push 数量与刷新按钮，以便一眼掌握各仓库状态。
4. 作为 pi-web 用户，我想点击 repo 项展开/折叠工作区变更，以便查看该仓库的改动。
5. 作为 pi-web 用户，我想展开后看到未 staged 与已 staged 两个区域，以便区分提交前状态。
6. 作为 pi-web 用户，我想在展开区顶部输入 commit message 并点击提交按钮，以便提交已暂存文件。
7. 作为 pi-web 用户，我想无已暂存文件时提交有确认提示（提交所有工作区文件），以便避免误提交。
8. 作为 pi-web 用户，我想在展开区对文件行做 stage/unstage（含全部），以便控制提交内容。
9. 作为 pi-web 用户，我想 repo 项 ⋮ 弹出工具栏：分支管理（切换/新建/合并/rebase/删除）、push/pull、stash，以便完成全部常用 git 操作。
10. 作为 pi-web 用户，我想刷新按钮重扫仓库并更新 ahead/behind 计数，以便状态实时。
11. 作为 pi-web 用户，我想展开区点击文件打开该文件的 diff（split：左 HEAD/右工作区，只读），以便查看改动细节。
12. 作为 pi-web 用户，我想普通文件 tab 是纯编辑器（无 diff 干扰），以便专注编辑。
13. 作为 pi-web 用户，我想单击文件以预览打开（tab 斜体），以便快速浏览不留下 tab 堆积。
14. 作为 pi-web 用户，我想单击另一个文件时预览 tab 被替换（全局仅一个预览），以便工作区整洁。
15. 作为 pi-web 用户，我想双击/按 Enter 将预览转为正式打开（tab 正体），以便固定常用文件。
16. 作为 pi-web 用户，我想编辑预览文件时自动转为正式打开，以便编辑不丢 tab。
17. 作为 pi-web 用户，我想从 git 面板打开的文件是正式 tab（diff 视图），以便与浏览预览区分。
18. 作为 pi-web 用户，我想同一文件的 diff tab 与编辑器 tab 可并存（图标区分），以便对照。
19. 作为 pi-web 用户，我想拖拽侧边栏边缘调整面板宽度，以便按需腾出空间。
20. 作为 pi-web 用户，我想侧边栏宽度在刷新后保持，以便布局稳定。

## Implementation Decisions

（以下不写具体文件路径；沿用现有 DDD/FSD 分层与 vscode-align 迭代先例）

- **Seam B（git 域）扩展**：
  - `discoverRepos(cwd, fs)`：递归扫描 `.git` 目录（目录深度 ≤ 4；跳过 node_modules/.git 与隐藏目录；`fs` 复用文件安全域的注入接口）；返回 repo 根路径数组（去重 + cwd 内排序：cwd 自身 repo 优先，其余按路径字典序）；嵌套 repo（父目录也是 repo）各自独立列出。
  - `repoBrief(root, git)`：`git branch --show-current` + `git status -sb`（解析 ahead/behind 计数 `[ahead N, behind M]`）；返回 `{ branch, ahead, behind }`。
  - 现有 git 操作函数（branch/stage/commit/push/pull/stash 等）已接受 cwd 参数——RPC 层传 repoRoot 即可复用，无需改动。
- **RPC 契约**：
  - 新增 `pi:gitRepos {}` → `{ repos: [{ root, name, branch, ahead, behind }] }`（name = 相对 cwd 的路径或根名）
  - 现有 git RPC（gitStatus/gitBranches/gitSwitch/gitBranchCreate/gitBranchDelete/gitMerge/gitRebase/gitStage/gitUnstage/gitCommit/gitPush/gitPull/gitStash/gitDiff）增加可选 `repoRoot` 参数（默认 cwd）
  - **repoRoot 白名单校验（服务端）**：repoRoot 必须 `resolveWithinRoot(cwd)` 内且该路径存在 `.git`（等价于发现列表——任何合法 repo 根必然可被发现；防任意路径 git 执行）；越权返回结构化错误
- **前端（FSD）**：
  - entities/workspace/tabs 扩展：tab 加 `preview: boolean`（仅文件 tab）——新纯函数：`openFile(state, path, name, { preview })`（预览打开时若已有预览 tab 则先关闭——全局唯一）、`promotePreview(state, path)`（preview → permanent）、`closeTab` 语义不变（预览关闭同普通）；diff tab 类型 `{ kind: "diff", path, name }`（与文件 tab 并存，`openDiffTab` 纯函数）；组件测试覆盖状态机
  - entities/workspace/layout：`loadPanelWidth/savePanelWidth`（localStorage 包装纯函数 + 测试——theme 偏好同机制）
  - features/git-panel 重构：GitPanel = repo 列表（`pi:gitRepos` 加载 + 头部重扫按钮）→ RepoItem（brief 行：展开箭头 + name + branch + ahead/behind 徽标（↓N ↑N）+ 刷新 + ⋮）→ 展开体（两区：未 staged/staged 文件行 + stage/unstage/全部 + commit textarea（2 行，Ctrl+Enter/按钮）+ 无 staged 时确认弹窗）→ popover（分支管理区（05a 功能平移）/ 远程 push/pull / stash 按钮组）
  - features/files 调整：TreeView 点击语义（onClick=preview、onDoubleClick=permanent、Enter=permanent）；EditorPane 移除 DiffView（纯编辑器）；DiffView 组件改造为 split diff（左 HEAD 原文/右工作区——数据来自 `git show HEAD:<path>` + 工作区内容 + 行级对齐着色）——新增 `pi:gitShowHead { path, repoRoot? }` RPC（`git show HEAD:path`，白名单内）
  - features/editor-tabs：TabsBar 渲染 preview 斜体（`italic`）+ diff tab 图标（split 图标）；diff tab 内容 = DiffSplitView（只读，两栏滚动联动）
  - app：侧边栏 aside 加拖拽手柄（onMouseDown → 拖动宽度 → savePanelWidth）；diff tab 激活渲染 DiffSplitView
- **preview 交互细节**：文件树单击 → `openFile(preview: true)`（若已有 preview tab 先 close 再开——同文件重复单击幂等）；双击 → `promotePreview`；编辑（onDirtyChange true）→ `promotePreview`；Enter → `promotePreview`；git 面板点击 → `openFile(preview: false)`
- **diff tab 数据流**：展开区点击文件 → `openDiffTab(path)` → DiffSplitView 挂载时 `pi:readFile`（工作区）+ `pi:gitShowHead`（HEAD 版）→ 行对齐渲染（公共行/增/删着色）——只读
- **侧边栏宽度**：`min 200 / max 480 / 默认 260`；拖拽期间实时更新宽度 state；mouseup 持久化；`.pi/sidebar-width` localStorage key（theme 偏好同 localStorage 机制）

## Testing Decisions

- 好测试标准不变（纯函数 + 注入接口 + 组件薄测 + 冒烟真实 git/fs）。
- **Seam B 单测**：discoverRepos（假 fs 目录结构：单 repo/多 repo/嵌套/深度超限/排除目录跳过/无 repo）、repoBrief（假 runner：branch + ahead/behind 解析：`[ahead 2, behind 1]`/`[behind 3]`/无远程）；repoRoot 白名单校验（cwd 内合法 / 越权 / 无 .git 拒绝）——先例：现有 git 域测试。
- **前端 entity 单测**：tabs preview 状态机（预览打开替换/唯一性/promote/编辑转正/diff tab 并存与关闭）、layout 持久化（localStorage mock）——先例：现有 entities 测试。
- **组件测试**：GitPanel repo 列表（空态/多项/展开折叠/brief 徽标）、展开区（两区渲染/stage/commit 按钮禁用态/无 staged confirm）、popover 三分区渲染、文件树单击双击语义、TabsBar preview 斜体与 diff 图标——先例：现有组件测试。
- **冒烟**（真实环境）：多 repo 目录（临时建 2 个 git repo + 无 repo 目录）→ 发现列表/brief/展开/commit/popover 操作；预览打开/替换/转正/斜体；diff tab split 显示真实改动；拖拽宽度 + 刷新保持。
- **关键反模式自查**：preview 状态机不测 DOM 细节（只测纯函数迁移）；repoBrief 不 mock 内部命令调用序列（用假 runner 返回 stdout）。

## Out of Scope

- diff tab 右侧可编辑（vscode 完整 diff editor）
- 远程分支管理（fetch 列表/删除远程分支）
- 仓库添加/移除的持久化（发现为实时扫描）
- repo 展开状态持久化
- 文件树按 repo 分组显示
- submodule 特殊处理
- 拖拽宽度按面板分别记忆（全局一个宽度）

## Further Notes

- "表达模糊处以 vscode 为准"——preview 语义、diff editor、SCM 面板结构均对齐 vscode 行为。
- repoRoot 白名单用"cwd 内 + .git 存在"等价于发现列表，避免服务端状态缓存（无状态 RPC 保持）。
- 现有 05a-05c 的 GitPanel 单 repo 功能整体平移进 repo item 的 popover 与展开区——不重写 git 域逻辑。
- theme 偏好已持久化（R26）；侧边栏宽度并入同一 localStorage 机制。
