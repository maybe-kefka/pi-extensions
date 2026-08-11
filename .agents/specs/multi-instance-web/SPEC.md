# SPEC：multi-instance-web（多 pi 实例共享 web 控制台 + UI polish）

迭代 slug：`multi-instance-web`。基线：files / vscode-align / git-multi-repo / git-panel-polish（见 `.agents/specs/`）。

## Problem Statement

1. **多实例共享**：同一工作区可运行多个 pi 进程（多终端各跑一个，不同 session）——现在各起各的 web 服务互不相通，浏览器无法同时看到/操作多个 session。
2. **chat tab 固定单会话**：web 的 chat tab 固定绑定"当前 session"（R26 跟随），不能同时开多个会话视图；切换 tab 时输入内容丢失；侧边栏点击会隐式切走主区（出现"从侧边栏选择文件"空态）。
3. **chip 样式突兀**：skill/file chip 有垂直 padding，高度超出正文行高。
4. **文件操作按钮拥挤**：hover 直接渲染在文件行右侧，选项少。

## Solution

**对等实例架构**：多个**对等的完整 pi 实例**（各有一个 session/agent 循环，真并行）共享一个 web 控制面。显式 `/web` 才入列；同 cwd 首个 /web 起服务并写状态文件，后续 /web 注册进已有服务。浏览器每个实例一个 chat tab，事件按实例分发，发送路由回对应实例。关闭 tab：宿主 tab 常驻不可关；web 启动的实例终止；用户自跑进程仅注销（进程继续）。

**UI polish**：chip 改"圆角 bg 的 text"（与正文同高）；文件操作改右键菜单并拓展；侧边栏不再隐式切主区（files view 删除）。

## User Stories

1. 作为用户，我希望同工作区多个 pi 进程（各在不同 session）共享一个 web 控制台，这样浏览器一个页面就能看全部会话
2. 作为用户，我希望 pi 进程**执行过 /web 才**出现在 web 页面，这样不打扰不想展示的进程
3. 作为用户，我希望每个 pi 实例对应一个 chat tab（显示它的 session），这样多个会话并行可见、可操作
4. 作为用户，我希望每个 tab 的 agent 并行运行（互不阻塞），这样在一个会话跑任务时另一个会话可继续对话
5. 作为用户，我希望从 pi 启动 web 时默认打开当前进程（宿主）的 chat 窗口
6. 作为用户，我希望 chat tab 切换不丢输入内容（input 保留），文件 tab 同理
7. 作为用户，我希望 TUI 切换 session 不影响 web 的 tab 页（宿主 tab 内容跟随进程 session，但不切换激活、不开新 tab）
8. 作为用户，我希望宿主 tab 常驻不可关（主区永不空）；其他 tab 关闭 = web 启动实例终止 / 用户进程注销（进程继续跑）
9. 作为用户，我希望"新建会话"按钮启动一个新 pi 实例并打开其 tab
10. 作为用户，我希望点击侧边栏（活动栏）只切换侧边栏面板，不切走主区内容（files view 空态删除）
11. 作为用户，我希望 skill/file chip 高度与正文一致（圆角 bg 的 text），不再突兀
12. 作为用户，我希望文件行右键出菜单（打开/打开 diff/重命名/删除/新建文件/新建目录/复制路径），不再行内挤按钮

## Implementation Decisions

- **状态文件**：`.pi/web.json`（cwd 内）——内容：宿主端口、token、宿主进程信息。仅精确 cwd 匹配的进程共享（不同目录各自独立实例）
- **/web 语义**：首进程（无状态文件）→ 起 HTTP/WS 服务 + 写状态文件 + 注册自己（宿主 = 注册者之一）；后续进程（有状态文件）→ 不重启服务，向宿主注册（端口/token 从状态文件读）；`--stop` 仅宿主有效（停服务清状态文件，注册者断开）
- **注册协议**（注册者 → 宿主，本地 HTTP/WS）：
  - `register`：进程信息（pid、cwd、sessionFile、sessionName）→ 返回 processId + 事件上行 WS 地址
  - 事件上行：注册者的 pi 事件（text_delta/message_start/tool_update/…）经 WS 推给宿主
  - 命令下行：宿主 → 注册者（sendMessage/abort 等）——注册者扩展接收后调 `api.sendUserMessage` 等
  - 断开 = 注销（进程表移除 + 浏览器 tab 关闭）
  - 宿主进程自身：本地直连（函数调用），同一进程表 entry
- **进程表**：`{ processId, pid, kind: "host" | "spawned" | "external", sessionFile, sessionName, cwd }`；浏览器 tab 键 = processId（`chat:<processId>`）
- **事件转发**：宿主把注册者事件广播给浏览器 WS，事件附加 `processId`；客户端按 processId 分发到对应 tab 状态
- **历史读取**：宿主按注册表 sessionFile 解析 jsonl（`getMessages` 的 entries 解析提取为纯函数）——`pi:chatHistory { processId }`
- **spawn 实例**：宿主 spawn `pi --mode rpc --extension web`（同 cwd）+ 环境变量（宿主 URL/token）→ 子扩展启动时发现环境变量自动注册（无需 /web）——kind="spawned"
- **客户端 tab 状态**：`chatStates: Record<processId, ChatState>`（现有 stream reducer 按 tab 实例化）；事件分发按 processId；Chat + InputBar 每 tab 常驻挂载（hidden class 保状态——input 不丢）
- **关闭语义**：宿主 tab 不可关；spawned tab 关 → 终止实例进程；external tab 关 → 发 deregister（进程继续跑）
- **R26 移除**：session_switch_ready 不再自动切 tab / loadHistory——宿主 tab 内容跟随进程 session（事件/历史按进程当前 session）
- **files view 删除**：FILES_VIEW_ID / 空态 hint / 活动栏自动激活逻辑删除——活动栏只切侧边栏
- **chip**：`rounded px-1.5`（去 py-0.5/去 inline-flex 的垂直撑高）、`text-xs` 保持、`align-middle`
- **右键菜单**：`@radix-ui/react-context-menu`（新运行时依赖，先例 radix 生态）；选项：打开（preview=false）/ 打开 diff / 重命名 / 删除 / 新建文件 / 新建目录 / 复制路径；行内 hover 操作按钮移除

## Testing Decisions

- 服务端纯函数（Seam B/C 新增）：状态文件读写、注册表增删、jsonl 历史解析（注入文件读取）——单测
- 客户端：tabs 状态机（processId chat tab 开/关/常驻/默认）；事件分发（按 processId）；组件测试（右键菜单选项回调、多 chat tab 渲染、input 常驻）
- 先例：tabs.test.ts、GitPanel.test.tsx（mock request + fireEvent）、git.test.ts（注入 runner）
- 跨进程协议：冒烟实测（起两个 pi 进程验证共享/注册/事件路由）

## Out of Scope

- 跨目录共享（精确 cwd 匹配）
- 实例间文件/git 状态隔离（共享宿主 cwd）
- 多实例鉴权增强（token 本机防误连）
- 进程内多 session tab（一进程一 tab，session 切换跟随进程）
- 远程/局域网访问

## Further Notes

- 宿主 = 首个 /web 的进程；其 tab 常驻且默认激活
- web spawn 的实例无 TUI——仅通过 web 交互；宿主 /web --stop 时 spawned 实例一并终止
- 事件上行协议复用现有 events 映射表（processId 附加字段）
