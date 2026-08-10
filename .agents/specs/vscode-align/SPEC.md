# SPEC：vscode 对齐（tab 系统 + 显式保存 + activity bar + git 控制面板）（迭代 slug: vscode-align）

## Problem Statement

pi-web 的文件功能虽然可用，但与主流编辑器心智差距明显：① 编辑即自动落盘（800ms 防抖），用户无法"只改不存"，误操作直接污染磁盘；② 单文件无 tab，无法同时打开多个文件对照；③ 聊天与文件是两个割裂的全屏视图，切换靠 Header 按钮；④ 左侧栏是固定面板列表，没有 vscode 式 activity bar 的心智；⑤ git 只有只读 diff/状态条，无法在网页端完成分支切换、暂存、提交、推送等日常操作。用户希望网页端成为一个"浏览器里的 vscode"。

## Solution

整体重构为 vscode 式布局与交互：

- **顶部 tab 条**：文件 tab（每个打开的文件一个 tab，独立编辑状态）+ 聊天 tab（标签显示当前会话名，常驻）。点击切换视图；文件 tab 可关闭；dirty tab 显示圆点。
- **显式保存模型**：移除防抖自动保存。编辑只改内存，Ctrl+S / tab 条保存按钮 / 关闭 dirty tab 时的三选（保存/不保存/取消）才落盘；mtime/hash 冲突检测保留。
- **activity bar 布局**：最左竖排图标条（文件浏览 / git 控制 / 会话管理 / 设置），点击展开对应面板（占原侧栏位置）；聊天区全宽（原右侧 Sidebar 移除，InputBar 保留）；Header 保留（连接状态/上下文占用/折叠）。
- **git 控制面板**：本地分支列表（当前高亮，点击切换，行 hover：合并/rebase/删除）；改动列表（工作区/staged 分组，文件级 stage/unstage + 全部 stage）；commit message 输入 + commit；push/pull；stash（push/pop/apply/drop）；merge/rebase 弹确认；分支删除弹确认。破坏性命令（reset --hard/clean/force push）拒绝。
- **文件操作**：新建文件/文件夹（弹窗输入名）、重命名（树内联输入框）、删除（确认弹窗，递归删除显示项数）、键盘导航（↑↓/Enter/Delete/F2）。文件树条目显示 git 状态后缀标记（M/A/D/??，目录聚合）。
- **联动**：保存成功后自动刷新 git 状态与改动列表。

## User Stories

1. 作为 pi-web 用户，我想同时打开多个文件（每个一个 tab），以便对照阅读/编辑不同文件。
2. 作为 pi-web 用户，我想看到所有打开的文件在顶部 tab 条中，以便快速切换。
3. 作为 pi-web 用户，我想点击 tab 关闭文件，以便释放工作区。
4. 作为 pi-web 用户，我想聊天与文件 tab 平级混排，以便聊天和编辑是同一工作区的两种视图。
5. 作为 pi-web 用户，我想聊天 tab 的标签显示当前会话名，以便多会话时知道在跟谁聊。
6. 作为 pi-web 用户，我想编辑文件只改内存（dirty 圆点标记），以便不误触磁盘。
7. 作为 pi-web 用户，我想按 Ctrl+S 保存当前文件，以便显式落盘。
8. 作为 pi-web 用户，我想在 tab 条上点击保存按钮（dirty 时出现/高亮），以便不用记快捷键。
9. 作为 pi-web 用户，我想关闭有未保存改动的 tab 时弹三选（保存/不保存/取消），以便不丢失工作。
10. 作为 pi-web 用户，我想保存时仍做 mtime/hash 冲突检测（外部修改提示覆盖/放弃/重新加载），以便不覆盖他人改动。
11. 作为 pi-web 用户，我想看到左侧 activity bar（文件/git/会话/设置图标），以便像 vscode 一样切换功能面板。
12. 作为 pi-web 用户，我想文件浏览面板展示 cwd 目录树（排除项/隐藏文件开关/刷新），以便浏览文件。
13. 作为 pi-web 用户，我想会话管理面板包含会话列表与新建/复制/重命名/删除/查看树，以便管理会话。
14. 作为 pi-web 用户，我想设置面板包含模型/思考级别/主题，以便集中配置。
15. 作为 pi-web 用户，我想聊天区全宽（原右侧栏移除），以便最大化阅读空间。
16. 作为 pi-web 用户，我想在 git 面板看到本地分支列表与当前分支高亮，以便了解分支状态。
17. 作为 pi-web 用户，我想点击分支即可切换（冲突时看到 git 错误信息），以便快速换分支工作。
18. 作为 pi-web 用户，我想分支行 hover 可合并/rebase/删除（删除弹确认），以便做分支维护。
19. 作为 pi-web 用户，我想看到改动列表（工作区/staged 分组）与文件级/全部 stage 操作，以便控制提交内容。
20. 作为 pi-web 用户，我想输入 commit message 并提交（空 message 禁用），以便完成本地提交闭环。
21. 作为 pi-web 用户，我想 push/pull 当前分支（成功/失败 toast），以便同步远程。
22. 作为 pi-web 用户，我想 stash push/pop/apply/drop 当前改动，以便临时保存工作。
23. 作为 pi-web 用户，我想 merge/rebase 前有确认弹窗，以便避免误操作影响工作区。
24. 作为 pi-web 用户，我想破坏性 git 操作（reset --hard/clean/force push）被拒绝，以便安全边界可预期。
25. 作为 pi-web 用户，我想在文件树新建文件/文件夹（弹窗输入名），以便在网页端创建文件。
26. 作为 pi-web 用户，我想在文件树内联重命名（选中项变输入框，Enter 确认/Esc 取消），以便快速改名。
27. 作为 pi-web 用户，我想删除文件/目录前有确认弹窗（递归删除显示项数），以便防误删。
28. 作为 pi-web 用户，我想文件树支持键盘导航（↑↓/Enter/Delete/F2），以便键盘流操作。
29. 作为 pi-web 用户，我想文件树条目显示 git 状态后缀标记（M/A/D/??，目录聚合），以便一眼看出改动分布。
30. 作为 pi-web 用户，我想保存文件后 git 状态与改动列表自动刷新，以便状态实时准确。
31. 作为 pi-web 用户，我想点击 git 面板的改动文件打开对应文件 tab（含 diff），以便直接查看改动内容。

## Implementation Decisions

（以下不写具体文件路径；模块名沿用现有 DDD/FSD 分层与 files 迭代先例）

- **RPC 契约（新增/扩展）**：
  - 文件操作：`pi:mkdir { path }`、`pi:rename { path, newName }`、`pi:delete { path }`（删除目录递归，返回删除项数）——全部过路径白名单；`pi:writeFile` 保留（显式保存复用）
  - git：`pi:gitStatus {}` → `{ isRepo, entries: [{ path, status: "M"|"A"|"D"|"??"|"R"|"U", staged: boolean }] }`（porcelain 解析）；`pi:gitBranches {}` → `{ current, branches: [{ name, current }] }`；`pi:gitSwitch { branch }`；`pi:gitBranchCreate { name }`；`pi:gitBranchDelete { branch }`；`pi:gitStage { path?, all? }` / `pi:gitUnstage { path?, all? }`；`pi:gitCommit { message }`；`pi:gitPush {}` / `pi:gitPull {}`；`pi:gitStash { action: "push"|"pop"|"apply"|"drop", message? }`；`pi:gitMerge { branch }` / `pi:gitRebase { branch }`
  - 错误契约：git 操作返回 `{ ok: true } | { ok: false, error }`（error 为 git 原始 stderr 摘要），不抛异常
- **Seam A（文件安全域）扩展**：FsLike 增 `mkdir/rename/rm`（rm 递归由实现方处理——真实 fs 用 `fs.rm(path, { recursive })`，注入接口保持最小）；新增纯函数 `renamePath`（白名单 + 目标名合法性：非空/不含路径分隔符/不以 . 开头冲突？——仅校验）、`deletePath`（白名单 + 返回目录删除项数）、`mkdirPath`；写操作全部复用 `resolveWithinRoot`。
- **Seam B（git 域）扩展**：
  - 白名单升级为 `(args) => { allowed: boolean; confirm?: "merge"|"rebase"|"delete-branch" }`——命令白名单扩展至：switch/branch(-c/-d 需 confirm)/commit/add/restore(--staged)/stash/merge(confirm)/rebase(confirm)/push/pull/rm/mv；永久拒绝：reset --hard、clean、push --force、checkout -- (破坏性路径)
  - `parsePorcelain(stdout)` → 文件状态数组（XY 双列解析：staged 位/工作区位；?? 未跟踪）
  - `aggregateStatus(entries)` → 目录聚合（父目录含改动则标记，路径字典序）
  - git 操作编排：每个操作 = 白名单校验 → 执行 → 结构化结果（失败带 stderr）
- **前端（FSD）**：
  - entities/workspace：`tabs` 状态机纯函数——`{ tabs: [{ kind: "file", path, name, dirty } | { kind: "chat" }], active }` + `openFile/closeTab/activateTab/switchSession`（聊天 tab 标签=当前会话名；关闭 dirty 前置确认标记）；保存流（显式保存 + Ctrl+S keymap + 三选）
  - entities/files 扩展：`fileOps`（新建/重命名/删除确认流状态机）、`gitStatus`（porcelain → 树条目标记映射 + 目录聚合镜像）
  - features/activity-bar：ActivityBar（4 图标）+ 面板容器（文件浏览/会话管理/设置平移现有内容；git 控制新建）
  - features/git-panel：GitPanel（分支区/改动列表/commit 区/stash 区；行 hover 操作；确认弹窗复用）
  - features/editor-tabs：TabsBar（tab 渲染/关闭/保存按钮）；EditorPane 多实例化（每文件 tab 独立编辑状态——`key=path` 实例化）
  - app：布局重构——Header + ActivityBar + (面板 | 主区 tab 条 + 内容)；移除 view state 与 Header 视图切换按钮；聊天 tab 内容 = Chat + InputBar（全宽）
- **保存模型**：EditorPane 移除 800ms 防抖 effect；`Ctrl+S` 经 CodeMirror keymap（Mod-s）触发保存；tab 条保存按钮保存当前激活文件 tab；关闭 dirty tab 触发三选（保存→保存后关闭 / 不保存→直接关 / 取消→保持）；切换 tab 不提示（vscode 同）。
- **git 状态标记**：文件树打开时并行拉 `pi:gitStatus`；打开/保存/面板操作后刷新；条目后缀图标（M 橙/A 绿/D 红/?? 灰——用现有语义变量 chart/primary/success/destructive 系）；目录聚合标记。
- **布局细节**：activity bar 48px 宽（图标竖排）；面板宽 260px（与现侧栏一致）；tab 条高 36px（文件 tab + 聊天 tab，横向滚动）；聊天 tab 常驻不可关闭。

## Testing Decisions

- 好测试标准不变（外部行为、纯函数优先、注入接口）；新增逻辑全部走 domain 纯函数 + 前端 entity 纯函数，组件薄测，冒烟覆盖真实 git/fs。
- **Seam A 单测**：rename/delete/mkdir 的路径白名单（逃逸/非法名/不存在）、递归删除项数（假 fs）、写操作错误码——先例：现有文件安全域测试。
- **Seam B 单测**：白名单扩展矩阵（switch/commit/add/stash 放行；reset --hard/clean/force push 拒绝；merge/rebase/delete-branch 带 confirm 标记）、porcelain 解析（XY 组合/未跟踪/重命名/冲突）、目录聚合（父子包含关系）、操作编排（假 runner 成功/失败/stderr 透传）——先例：现有 git 域测试。
- **前端 entity 单测**：tabs 状态机（打开/关闭/激活/dirty 流转/关闭确认三选/聊天 tab 会话名跟随）、fileOps 确认流、porcelain → 树标记映射——先例：现有 entities 测试。
- **组件测试**：TabsBar（渲染/关闭/保存按钮/聊天标签）、GitPanel（分支列表/改动列表/stage/commit 禁用态/确认弹窗）、文件树操作（新建弹窗/内联重命名/删除确认）——先例：现有组件测试（jsdom + CodeMirror mock）。
- **冒烟**（真实 pi 进程 + 真实 git 仓库）：多文件 tab 切换、显式保存落盘、关闭 dirty 三选、activity bar 面板切换、分支切换（含冲突报错）、stage/commit 全链路（提交后 git log 验证）、push/pull 反馈、stash 往返、文件新建/重命名/删除落盘验证、git 状态标记实时刷新、键盘导航。

## Out of Scope

- 文件树拖拽移动
- tab 状态持久化（刷新回默认聊天 tab）
- 每会话一个聊天 tab（标签=当前会话名，单一聊天 tab）
- 冲突解决编辑器（merge 冲突标记仅提示）
- commit amend / 作者信息 / 签名
- force push / reset --hard / clean 等破坏性命令
- 远程分支管理（fetch 列表/删除远程分支）
- 文件系统 watcher（外部变化监听）
- 回收站/撤销删除

## Further Notes

- 安全哲学延续"宁缺毋滥"：写命令白名单逐条批准，破坏性命令永久拒绝；确认弹窗是第二道闸（merge/rebase/分支删除/文件删除）。
- 显式保存是本次行为变更的核心——旧 800ms 防抖逻辑与相关测试将移除/改写。
- git 错误信息原样透传（分支冲突/认证失败/非 fast-forward 等对用户可读）。
- 会话切换（会话管理面板）不关闭/不保存任何文件 tab；文件 tab 与会话解耦（cwd 不变）。
- activity bar 折叠态仅图标，展开态互斥（点另一图标切换面板）；面板可再点当前图标收起。
