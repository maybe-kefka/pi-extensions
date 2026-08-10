# SPEC：文件编辑器 + git diff + worktree 支持（迭代 slug: files）

## Problem Statement

pi-web 目前只能查看会话与上下文，无法查看/修改工作目录文件。用户（通过本地 Web 控制台）在浏览器里查看 pi 会话时，常常需要看代码、对照 pi 的改动、或在会话间隙自己改点东西——现在只能切回终端。同时，工作目录普遍是 git 仓库（含 git worktree 场景），用户需要**只读地**查看文件相对 HEAD 的 diff（pi 会话刚改了什么），而无需掌握 git CLI。

## Solution

在 pi-web 新增独立页面 `/files`：三栏布局（目录树 | 文件编辑器 | 内联 diff 视图）。

- **目录树**：以 pi 进程 cwd 为根；排除 `node_modules/.git/dist/.pi` 与隐藏文件（均可一键切换显示）；按需展开（单目录加载），带手动刷新按钮。
- **编辑器**：CodeMirror 6；文本文件 >500KB 只读；二进制嗅探（NUL 字节）拒开；单文件（无 tab）；编辑防抖 800ms 自动保存 + 脏标记。
- **内联 diff**：打开文件时显示该文件 vs HEAD 的 unified diff（行级标记：新增/删除/上下文着色），保存成功后自动刷新；非 git 目录或文件无改动时显示"无改动/非仓库"占位。
- **冲突检测**：打开时记录 mtime + 内容哈希，保存前服务端校验；磁盘内容已变则弹三选一（覆盖 / 放弃 / 重新加载）。
- **git worktree 支持**：git 命令自动适配 worktree（git 自身语义）；页面头部状态条显示 repo 根、当前分支、是否 linked worktree。
- **安全**：token 门禁（现状）+ 路径白名单（所有文件操作经规范化校验，仅限 cwd 内，symlink 逃逸防护）+ git 只读命令白名单（diff/status/log/show/rev-parse/branch，其中 diff 允许 `--cached`）。

## User Stories

1. 作为 pi-web 用户，我想在 `/files` 页面浏览 cwd 目录树，以便找到我要查看/编辑的文件。
2. 作为 pi-web 用户，我想按需展开子目录（而非一次性加载全树），以便大仓库浏览不卡顿。
3. 作为 pi-web 用户，我想切换显示/隐藏 `node_modules`、`.git`、`dist`、`.pi` 等目录，以便必要时也能查看被排除内容。
4. 作为 pi-web 用户，我想切换显示/隐藏隐藏文件（dotfiles），以便默认不被 `.env` 等敏感文件干扰。
5. 作为 pi-web 用户，我想点击文件在编辑器中打开并查看其内容，以便快速阅读代码。
6. 作为 pi-web 用户，我想编辑文件并在停止输入约 800ms 后自动保存到磁盘，以便无需手动保存。
7. 作为 pi-web 用户，我想看到未保存的脏标记，以便知道哪些文件有未落盘改动。
8. 作为 pi-web 用户，我想打开超过 500KB 的文件时只能只读查看，以便避免大文件导致编辑器卡顿。
9. 作为 pi-web 用户，我想打开二进制文件时看到"二进制文件不可编辑"提示而不是乱码，以便理解为何不可编辑。
10. 作为 pi-web 用户，我想在打开文件时看到该文件相对 HEAD 的 diff（行级标记），以便了解 pi 会话或他人改了什么。
11. 作为 pi-web 用户，我想在保存文件后看到 diff 自动刷新，以便确认我的改动在 diff 中正确体现。
12. 作为 pi-web 用户，我想在非 git 目录中编辑文件时看到"非 git 仓库，无 diff"提示，以便理解 diff 视图缺失的原因。
13. 作为 pi-web 用户，我想在文件被外部修改（如 pi 会话刚改过）时保存得到冲突提示并可选择覆盖/放弃/重新加载，以便不丢失任何一方改动。
14. 作为 pi-web 用户，我想看到页面头部状态条显示当前 repo 根、分支与 worktree 标记，以便确认我在哪个仓库哪个分支编辑。
15. 作为 pi-web 用户，我想在 git worktree（linked worktree）中正常使用 diff 与状态信息，以便适配 worktree 工作流。
16. 作为 pi-web 用户，我想使用手动刷新按钮重新加载目录树，以便看到外部新建/删除的文件。
17. 作为 pi-web 用户，我想在侧栏导航中进入 `/files` 页面，以便从会话页顺畅切换到文件工作区。
18. 作为 pi-web 用户，我想确信浏览器上的操作被限制在 cwd 内且 git 只能执行只读命令，以便在局域网开放时无安全顾虑。

## Implementation Decisions

（以下不写具体文件路径；模块名以现有 DDD/FSD 分层为参考）

- **RPC 契约**（新增 5 个方法，均走现有 WS RPC 管道与 token 门禁）：
  - `pi:listDir { path }` → `{ entries: [{ name, type: "dir"|"file", size, mtimeMs }] }`（单目录展开，非递归；path 为空 = cwd 根）
  - `pi:readFile { path }` → `{ content, size, mode: "text"|"binary"|"too-large", mtimeMs, hash }`（binary/too-large 时 content 为空；hash 为内容哈希，供冲突检测）
  - `pi:writeFile { path, content, expectedHash, expectedMtimeMs }` → `{ ok: true } | { ok: false, reason: "conflict"|"denied"|"not-found"|"readonly" }`（服务端校验 expected 快照；冲突返回 409 语义）
  - `pi:gitDiff { path }` → `{ isRepo: false } | { isRepo: true, diff: null } | { isRepo: true, diff: DiffHunk[] }`（单文件 vs HEAD；DiffHunk 见下）
  - `pi:gitInfo {}` → `{ isRepo: false } | { isRepo: true, repoRoot, branch, worktree: boolean }`
- **DiffHunk 结构化类型**（来自 unified diff 解析）：`{ header: string, lines: [{ type: "add"|"del"|"ctx", text }] }`——客户端据此渲染行级标记。
- **文件安全域（Seam A）**：纯函数 + 注入 fs 接口（`readdir/lstat/readFile` 最小接口）：
  - `resolveWithinRoot(root, relPath)`：规范化 + `..` 逃逸拒绝
  - symlink 逃逸防护：目标路径的每一级 lstat 检查，指向 cwd 外的 symlink 拒绝
  - `buildDirListing(root, relPath, opts, fs)`：单目录展开，应用排除/隐藏规则
  - `classifyFile(size, buffer)`：>500KB → `too-large`；NUL 字节嗅探 → `binary`；否则 `text`
- **git 域（Seam B）**：纯函数 + 注入 git runner（`runGit(args): Promise<{ code, stdout, stderr }>`，实现用现有 `execCommand`，`shell:false`）：
  - `assertReadOnlyGit(args)`：白名单校验（命令 ∈ { diff, status, log, show, rev-parse, branch }；diff 仅允许 `--cached`/`--stat` 等只读标志；拒绝一切含破坏性语义的参数组合）
  - `parseGitDiff(unifiedText)`：→ `DiffHunk[]`
  - `repoInfo(root, git)`：`rev-parse --is-inside-work-tree`、`--show-toplevel`、`--abbrev-ref HEAD`、`--git-dir` vs `--git-common-dir` 对比 → worktree 标记
- **application 编排层（Seam C）**：RPC 处理器，依赖注入（fs 实现 + git runner + 安全域/git 域纯函数）；所有文件路径先过 Seam A 校验，所有 git 调用先过 Seam B 白名单；writeFile 校验 expected 快照（mtime + 内容哈希任一不符 → conflict）；非法请求返回结构化错误码。
- **前端（FSD）**：
  - entities/files：客户端模型纯函数（DiffHunk 行映射、脏状态机、树展开状态、分类判定镜像）
  - features/files：FilesPage（三栏）、TreeView（按需展开 + 切换显示 + 刷新）、EditorPane（CodeMirror 6 + 防抖保存 + 脏标记 + 冲突三选弹窗）、DiffView（行级标记渲染）
  - app：路由注册 `/files` + 侧栏导航项（先例：现有页面导航）
- **依赖新增**（前端 bundle，不违反 server 运行时依赖约束）：`@codemirror/state`、`@codemirror/view`、`@codemirror/language` + 常用语言包（`@codemirror/lang-javascript` 等按需）+ `@uiw/react-codemirror`（React 集成封装，内部已含上述核心）。diff 行标记自实现（不引 CodeMirror merge 包）。
- **冲突检测在服务端执行**（客户端传 expected 快照，服务端对比磁盘现状）——客户端校验可被绕过，服务端校验才可信。
- **worktree 识别**：`git rev-parse --git-dir` 与 `--git-common-dir` 输出不同 → 位于 linked worktree。
- **目录树默认排除**：`node_modules`、`.git`、`dist`、`.pi` + 隐藏文件（dot 开头）；页面提供"显示排除项/显示隐藏文件"两个开关（仅客户端状态，服务端每次 listDir 按请求参数应用规则）。

## Testing Decisions

- 好测试的标准：只测外部行为（输入 → 输出/副作用结果），不测实现细节；域层纯函数优先，注入接口用内存替身。
- **Seam A（files 域）单测**：路径逃逸（`../`、绝对路径、空串）、symlink 逃逸（假 fs 返回 symlink 类型）、排除/隐藏规则、二进制嗅探（NUL 字节样本）、too-large 阈值——用内存假 fs（先例：现有 domain 纯函数测试模式）。
- **Seam B（git 域）单测**：白名单矩阵（允许/拒绝的典型命令组）、unified diff 解析（含 hunk 头/新增/删除/上下文/文件尾无换行 `\ No newline`）、repoInfo（假 runner 返回模拟输出，worktree 真假两态）——先例同 Seam A。
- **Seam C（编排层）单测**：注入假 fs + 假 runner，覆盖：合法读/写、冲突（hash 或 mtime 不符）、路径越权拒绝（`..`/symlink）、非 git 目录 gitDiff 降级、白名单拒绝（`git checkout` 等被拒）——先例：现有 application 层测试模式。
- **前端 entity 单测**：DiffHunk → 行标记映射（纯函数）、脏状态机（编辑/保存/冲突三选）、树展开状态——先例：现有 entities 测试。
- **组件测试**：FilesPage 最小交互（打开文件 → 显示内容、保存 → 调用 writeFile、冲突弹窗渲染）——先例：现有组件测试（jsdom + testing-library）；CodeMirror 在 jsdom 下只测容器渲染与 onChange 桥接，不测编辑器内部。
- **冒烟**（真实环境）：真实 pi 进程 + 真实 git 仓库（含 linked worktree 子目录）：目录树浏览、打开/编辑/保存真实文件、diff 显示真实改动、冲突场景（pi 会话侧改文件后保存）、worktree 状态条——浏览器冒烟，不做自动化。

## Out of Scope

- 新建/重命名/删除文件、目录创建
- staged 暂存操作（`git add`/`restore`）、提交、分支切换
- 多文件 Tab、分屏对比（split diff）
- fs.watch 自动刷新目录树
- 编辑内容作为上下文发送给当前会话
- 写操作需要 pi 进程/TUI 侧确认的审批流
- 大文件懒加载分片（>500KB 一律只读）
- 非 UTF-8 文本编码支持（嗅探为二进制拒开）
- 局域网外访问/认证强化（维持 token 门禁现状）

## Further Notes

- 白名单哲学：宁缺毋滥——第一版只读 git 子集；后续如需要"暂存/放弃"再评估（需补冲突与确认机制）。
- 防抖 800ms 与 500KB 阈值均为保守默认，可按实际使用调整。
- CodeMirror 6 经 Vite tree-shake 后体积可控；若 @uiw/react-codemirror 与现有 React 19 有兼容问题，降级为直接组合 @codemirror/* 核心包（薄封装 ≤100 行）。
- worktree 场景的 git 命令无需特殊处理（git 自动针对 worktree 的 HEAD 与索引），识别仅用于状态条展示。
- 目录树按需展开同时天然规避了超大仓库的递归爆炸问题（与 R27 树爆栈事故同源风险）。
