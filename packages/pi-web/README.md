# @kefka/pi-web

Pi 扩展：`/web` 命令——在当前 pi 进程内启动一个本地 Web 控制台，与 TUI 共享同一 session（完整双向：看消息流、工具执行、状态；发消息、切会话、fork、树导航、切模型、调思考等级）。

## 用法

```
/web                启动（随机端口）或打印当前 URL
/web --port 8080    指定端口启动（0 = 随机；冲突会报错，先 /web --stop）
/web --open         启动并打开默认浏览器（Termux 走 termux-open-url）
/web --stop         优雅关闭服务
```

- 重复运行 `/web` 只打印 URL，不重启、不换端口。
- 服务是进程级单例：TUI 里 `/new`、`/resume`、`/fork` 切会话**不断线**；`/reload` 或退出会关闭，重跑 `/web` 即可。
- 安全：只绑定 `127.0.0.1`，URL 带随机 token（HTTP 与 WS 握手都校验）。

## 功能

- **聊天流按轮聚合气泡（ChatGPT 式）**：每条 user 消息一个气泡，多轮工具循环的**思考块（可折叠内联展开，流式 "Thinking…" / 结束 "Thought"）**、**工具卡片（内联交错，点击看参数/输出）**、正文交替呈现；气泡底部工具栏：fork + **progress**（流式中旋转 / 结束后对勾，点击 → 时间线弹窗完整展示全部 reasoning + Action 流程）。
- **会话控制**：点击列表项切换（resume）、顶部新建（new）、每项工具栏——复制（clone）、重命名、查看树（树弹窗可导航）、删除（仅非当前会话，fs 直删，删除前确认）。
- **模型 / 思考等级 / compact / abort**：侧栏与 header 直接操作；**输入区发送/abort 融合**（空闲 ↑ 发送，LLM 运行中 ■ 停止）。
- **上拉框输入（ChatGPT 式）**：任意位置 **space+/** 触发 skills + 命令上拉框（上下键/回车/Esc，选中 skill 插入 chip `/skill:xxx`、命令插入纯文本），**space+@** 触发工作目录文件上拉框（gitignore 过滤、按目录分组，插入路径 chip）；选中时触发字符自动替换；LLM 运行时回车自动排队（"已排队 ×N" 提示条）。

## 已知限制（详见 docs/SPEC.md §9）

- **不能从 web 执行扩展命令**（含 prompt 模板 / skill 命令）：0.83.0 无公开执行 API；`/` 上拉框展示 skills + 命令，但选中后以纯文本插入输入框原样发送（不执行）；上游 feature 建议见 SPEC §9。
- **TUI 手动切换会话后**（TUI 里跑 `/resume` `/new`），web 端会话控制（新建/切换/fork/树导航）临时失效，需在 TUI 重跑 `/web` 恢复；发消息/模型等其余能力自动恢复。web 端发起的切换不受影响。
- `/reload`、`/quit` 及 TUI 专属命令（export/import/share/copy/login/logout 等）不派发。

## 协议（JSON-RPC 2.0 over WebSocket）

- 客户端→服务器：`{jsonrpc:"2.0", id, method, params}`；方法：`pi:sendMessage` / `pi:abort` / `pi:compact` / `pi:listSessions` / `pi:switchSession` / `pi:newSession` / `pi:fork` / `pi:clone` / `pi:navigateTree` / `pi:getTree` / `pi:deleteSession` / `pi:setSessionName` / `pi:listModels` / `pi:setModel` / `pi:getThinkingLevel` / `pi:setThinkingLevel` / `pi:listSkills` / `pi:listCommands` / `pi:listFiles` / `pi:getMessages` / `pi:getState`。
- 服务器→客户端：notification `{jsonrpc:"2.0", method:"pi:event", params:{type,...}}`（message_* / tool_execution_* / turn_* / agent_* / queue_update / state / session_* / notify / setStatus / setWidget）。
- agent 忙碌时回车自动 followUp 排队（steer 已移除）。

## 开发

```bash
npm install
npm run build:web        # 构建前端到 web/dist（改前端后需重新构建）
npm run typecheck -w @kefka/pi-web
npm test
```

前端：`packages/pi-web/web/`（React 19 + Vite + Tailwind v4 + shadcn，`web/dist` 提交进 git）。扩展侧运行时依赖 `ws` + `ignore`；`src/` 纯函数层（args/protocol/coalescer/events/state/http-util/fork-util/session-files/file-lister）全 TDD；`src/index.ts` 薄接线层；`src/server.ts` 薄层。
