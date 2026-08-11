# SPEC：git-panel-polish（侧边栏 polish + 分支选择弹窗）

迭代 slug：`git-panel-polish`。基线：files / vscode-align / git-multi-repo（见 `.agents/specs/`）。

## Problem Statement

使用 pi-web 文件/git 侧边栏时，与 vscode 体验有差距：

- 文件树有"排除项/隐藏项"开关，vscode 默认 explorer 显示一切（仅 `.git` 隐藏）——开关是噪音
- 侧边栏内容展开后溢出，面板不独立滚动
- 文件/git 侧边栏 header 与主区 tab 栏高度不一致（40px vs 36px），git 面板无标题行
- repo 行 refresh 按钮在 ahead/behind 数字右侧且过大（lucide 默认 24px）
- commit 输入框固定两行高，无法一行收起、多行时自动变高；触发键与 vscode 不一致
- 展开区"未暂存"区在"已暂存"区上方，与 vscode 顺序相反
- repo 行的分支名不可点——切换/创建分支只能进 popover 逐条操作；vscode 点分支名即弹选择列表，且支持输入新名创建（含从远程分支创建）

## Solution

按 vscode 语义重构侧边栏：

- 文件树固定过滤：显示一切（含 `.env`、node_modules 等），仅 `.git` 目录隐藏；删除"排除项/隐藏项"开关与状态概念
- 文件/git 侧边栏各自独立滚动（scrollbar-thin）；顶部 header 与 tab 栏统一 36px；git 面板增加"源代码管理"标题行
- repo 行：refresh 按钮移到 ahead/behind 数字左侧并调小（size-3）；展开区"已暂存"区移到"未暂存"区上方
- commit 输入框：默认一行（auto-grow，内容增加自动变高）；Enter = 换行、Shift+Enter = 提交、Ctrl+Enter = 提交（保留）
- 分支选择弹窗（点击 repo 行分支名触发，alert 样式 Dialog）：顶部输入框（实时过滤分支列表）+ 本地/远程分组分支列表（点击即切换/创建跟踪）；输入不存在的名字回车 → 弹窗内联展开"从哪个分支创建"（base 列表 = 本地 + 远程，单选 + 确认）→ 创建并立即切换
- 远程分支：`pi:gitBranches` 返回扩展（remotes 字段）；点击 `origin/foo` → 本地无 `foo` 时 `git switch -c foo --track origin/foo`（创建跟踪分支并切换），本地已有 `foo` 时直接 `git switch foo`
- popover 管理区（merge/rebase/删除）不变，分支列表只列本地分支

## User Stories

1. 作为用户，我希望文件树默认显示所有文件（含 .env、node_modules），只隐藏 .git，这样我不用手动开关"排除项/隐藏项"就能看到真实目录
2. 作为用户，我希望侧边栏面板（文件/git）各自独立滚动，这样树展开很深时内容不溢出面板、主区不受影响
3. 作为用户，我希望文件面板 header、git 面板 header、主区 tab 栏三处高度一致（36px），这样视觉对齐
4. 作为用户，我希望 git 面板顶部有"源代码管理"标题行，这样与 vscode 布局一致、面板身份明确
5. 作为用户，我希望 repo 行的 refresh 按钮在 ↓↑ 数字的左边且尺寸小，这样数字可读、按钮不喧宾夺主
6. 作为用户，我希望展开区的"已暂存"区在"未暂存"区上方，这样与 vscode 顺序一致
7. 作为用户，我希望 commit 输入框默认一行、内容变多自动变高，这样不占空间
8. 作为用户，我希望 commit 输入框 Enter 换行、Shift+Enter 提交（Ctrl+Enter 仍可用），这样多行提交信息可写、触发键与 vscode 习惯一致
9. 作为用户，我希望点击 repo 行的分支名弹出分支选择弹窗，这样切换分支不用进两级菜单
10. 作为用户，我希望弹窗内分支列表分"本地/远程"两组展示，这样远程分支可见可操作
11. 作为用户，我希望点击本地分支即切换（当前分支带标记不可点），这样一键完成
12. 作为用户，我希望点击远程分支（origin/foo）创建本地跟踪分支 foo 并切换（本地已有 foo 则直接切 foo），这样与 vscode 行为一致
13. 作为用户，我希望弹窗顶部输入框实时过滤分支列表，这样分支多时快速定位
14. 作为用户，我希望输入不存在的分支名回车后，弹窗内联出现"从哪个分支创建"（列出本地+远程分支单选 + 确认），这样创建流程不跳窗
15. 作为用户，我希望创建分支后立即切换到新分支，这样流程连贯
16. 作为用户，我希望 popover 管理区（合并/rebase/删除）只列本地分支，这样不会对远程分支产生误导性操作
17. 作为用户，我希望删除分支、合并/rebase 等破坏性操作仍走原有确认流程，这样安全护栏不因新弹窗而削弱

## Implementation Decisions

- **文件树固定过滤**：`ListDirOptions` 删除 showExcluded/showHidden 两个字段；服务端 listDir 固定跳过 `.git` 目录，其余（含隐藏文件、node_modules、dist、.pi）全部显示。客户端 TreeState 删除 showExcluded/showHidden/setShowOptions；FilesTree 删除两个 toggle 按钮与"默认过滤"状态提示
- **侧边栏滚动**：文件/git 面板容器加 scrollbar-thin + overflow-y-auto + h-full min-h-0（与会话/设置面板一致的容器模式）
- **header 对齐**：面板 header 高度统一 36px（h-9 语义）；文件面板现有标题行微调 padding；git 面板新增"源代码管理"标题行（icon + 标题 + 对齐）
- **repo 行**：refresh 按钮移到 ↓↑ 数字左侧、图标 size-3（现默认 24px）；展开区渲染顺序：已暂存区在上、未暂存区在下（数据已分 staged/unstaged 两组，仅交换 JSX 顺序）
- **commit 输入框**：rows=1 + 内容变化时按 scrollHeight 自动增高（auto-grow）；onKeyDown：Enter 不放行（textarea 天然换行）、Shift+Enter 与 Ctrl/Meta+Enter 均触发提交；提交按钮保留
- **分支数据源**：`listBranches` 改用 `git branch -a --no-color` 解析——本地分支（`git branch` 输出非 remotes/ 前缀项）与远程分支（`remotes/origin/foo` → 展示名 `origin/foo`）分组；返回值 `{ current, branches, remotes }`（branches=本地名、remotes=`origin/foo` 全名）
- **切换/创建编排**（git 域纯函数 + GitRunner 注入）：
  - `switchOrTrack(remote)`：短名 = remote 去掉 `origin/` 前缀；本地分支列表含短名 → `git switch <短名>`；否则 `git switch -c <短名> --track <remote>`
  - `createBranch(name, base)`：`git switch -c <name> <base>`（base 可为本地或远程名；switch -c 即创建并切换）
  - `assertGitOp` switch 白名单增加 `--track`（`-c` 已有）
- **RPC 契约**：`pi:gitBranches` 返回增加 `remotes: string[]`；新增 `pi:gitCreateBranch { name, base, repoRoot }`（校验 name/base 合法性：非空、非 `-` 开头、白名单走 assertGitOp）
- **弹窗交互**（client）：repo 行分支名徽标 → clickable（cursor-pointer + title）；弹窗 = 现有 Dialog（alert 样式）；内容：输入框（value 控制：过滤列表 + 候选新名）+ 列表（本地组/远程组，当前分支 Check 标记不可点）+ 内联第二步（输入名不在列表时展示："从哪个分支创建" + base 单选列表 + 确认按钮 → `pi:gitCreateBranch`）→ 成功后 toast + 刷新 brief/状态 + 关闭弹窗
- **popover**：分支管理区改为只渲染本地分支（用 `pi:gitBranches` 返回的 branches 字段，remotes 不出现）
- 远程切换/创建成功后的刷新：refreshBrief（ahead/behind/当前分支徽标）与展开区状态联动（复用 gitRefreshKey 机制）

## Testing Decisions

- 只测外部行为（输入 → 输出/调用），不测实现细节；服务端纯函数注入 GitRunner 假实现断言 argv，客户端组件测试断言 DOM 交互与 RPC 调用
- **git 域（Seam B）单测**：listBranches 本地/远程解析分组（`git branch -a` 输出样例：本地、`remotes/origin/*`、当前分支 `*` 标记）；switchOrTrack 两分支（本地短名存在 → `switch <short>` / 不存在 → `switch -c <short> --track <remote>`）；createBranch argv（`switch -c <name> <base>`）；assertGitOp：`switch -c x --track origin/main` 放行、`--track` 外标志仍拒绝
- **files 域（Seam A）单测**：listDir 固定过滤——.env 与 node_modules 显示、.git 隐藏；ListDirOptions 不再有 showExcluded/showHidden（编译级保证）
- **client 单测**：tree.ts 状态机删除 showExcluded/showHidden 相关（现有用例改写）；FilesTree 组件无 toggle 按钮回归
- **GitPanel 组件测试**：分支弹窗全流程——点分支名徽标 → 弹窗出现（本地/远程分组渲染）→ 点本地分支 → `pi:gitSwitch` 调用 + 弹窗关闭；输入新名 → 内联"从哪个分支创建"出现 → 选 base + 确认 → `pi:gitCreateBranch` 调用；点远程分支 → switchOrTrack 对应 RPC 调用；当前分支不可点
- 先例：git.test.ts（注入 GitRunner 断言 argv）、GitPanel.test.tsx（mock request + fireEvent/userEvent 交互）

## Out of Scope

- 远程分支删除/推送（push --delete）与远程管理
- popover 管理区 UI 改动（保留现状，仅数据源切到新接口的本地分支字段）
- 分支弹窗的"最近使用/收藏"等排序增强（列表按名字序即可）
- .gitignore 灰显支持（vscode 对忽略文件置灰——本迭代不做）
- 会话/设置面板的滚动与 header（已有各自滚动，不动）
- 主区 tab 栏高度调整（保持 36px 为基准，侧边栏向它对齐）

## Further Notes

- 弹窗打开时机与 popover 一致：打开时拉取 `pi:gitBranches`（含 repoRoot）
- 切换分支成功后原有 toast 文案保留（"已切换到 X"），创建分支为"已创建并切换到 X"
- 输入框同时承担过滤与新建：输入值精确匹配列表内分支 → 高亮该分支（回车 = 切换）；不匹配 → 回车进入创建第二步
- 布局对齐以 h-9（36px）为统一基准；safe-area 处理不涉及侧边栏
