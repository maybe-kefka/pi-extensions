# @kefka/pi-web

Pi 扩展：`/web` 命令——在当前 pi 进程内启动一个本地 Web 控制台，与 TUI 共享同一 session（完整双向：看消息流、工具执行、状态；发消息、切模型、调思考等级）。

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

## 已知限制（详见 docs/SPEC.md §9）

- **不能从 web 执行任意 `/命令`**（`sendUserMessage` 硬编码跳过命令处理）；侧栏命令列表只读。
- **不能从 web 切换/新建会话**（会话控制仅存在于命令上下文 `ExtensionCommandContext`，扩展 API 无派发入口）；会话列表可看，切换需在 TUI 用 `/resume`、`/new`。
- 树导航 / fork / clone 留 v2。

## 协议（JSON-RPC 2.0 over WebSocket）

- 客户端→服务器：`{jsonrpc:"2.0", id, method, params}`；方法 `pi:sendMessage` / `pi:abort` / `pi:listSessions` / `pi:listModels` / `pi:setModel` / `pi:getThinkingLevel` / `pi:setThinkingLevel` / `pi:listCommands` / `pi:getState`。
- 服务器→客户端：notification `{jsonrpc:"2.0", method:"pi:event", params:{type,...}}`（message_* / tool_execution_* / agent_* / queue_update / state / session_* / notify / setStatus / setWidget）。
- agent 忙碌时 `pi:sendMessage` 必须带 `deliverAs`（`"steer"` 打断 / `"followUp"` 排队），否则返回错误。

## 开发

```bash
npm install
npm run build:web        # 构建前端到 web/dist（改前端后需重新构建）
npm run typecheck -w @kefka/pi-web
npm test
```

前端：`packages/pi-web/web/`（React 19 + Vite + Tailwind v4 + shadcn，`web/dist` 提交进 git）。扩展侧运行时依赖仅 `ws`；`src/` 纯函数层（args/protocol/coalescer/events/state/http-util）全 TDD；`src/index.ts` 薄接线层；`src/server.ts` 薄层。
