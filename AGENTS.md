# pi-extensions 项目说明

个人 pi 扩展 monorepo（npm workspaces，包名模式 `@kefka/pi-*`）。包含：`packages/pi-status`（`/status` 命令——上下文占用分类面板）与 `packages/pi-web`（`/web` 命令——本地 Web 控制台，含 `web/` 前端子工作区，构建产物 `web/dist` 提交进 git）。

## 目录结构

```
packages/pi-status/
├── src/
│   ├── index.ts        # 薄接线层：registerCommand、取 API 数据、调聚合、setWidget/setStatus/notify
│   ├── widget.ts       # 编辑器上方固定 widget：renderStatusWidget（全量面板，每帧读快照）+ setStatusData
│   ├── context.ts      # 纯函数：computeContextBreakdown / estimateTextTokens
│   ├── format.ts       # 纯函数：tokens/percent/bar/displayWidth/行渲染/buildPanelRows/renderSummaryLine
│   ├── resources.ts    # 纯函数：summarizeResources（skills/plugins/mcps 聚合）
│   └── mcp-config.ts   # 纯函数：listMcpServers（配置发现+解析）
└── test/               # vitest 单测（TDD）
docs/
├── SPEC.md             # 规格（权威需求文档）
└── TICKETS.md          # 任务清单（SPEC → tickets → TDD）
```

## 开发约定（硬约束）

- **流程**：改动遵循 `docs/SPEC.md` → `docs/TICKETS.md` 新增 ticket → TDD（先写失败测试，再实现）→ `npm run typecheck` + `npm test` 全绿 → 提交
- **发布（publish）必须用户明确指示后才能执行**：用户没说"发布/推送 npm"，一律不自行 `npm publish`、不 bump 版本号；实施完成后只汇报结果，把发布作为待办等用户开口
- **`src/index.ts` 必须是薄接线层**：不写业务逻辑、不做单测；其余 src 模块全部纯函数 + 单测
- **类型导入用 `import type`**（`verbatimModuleSyntax` 强制）
- **运行时依赖仅 `@earendil-works/pi-tui`**；`@earendil-works/pi-coding-agent` 仅作类型导入（devDependency）
- 改动代码后必须跑 `npm test` 和 `npm run typecheck`

## 常用命令

```bash
npm test              # vitest 全量
npm run typecheck     # 各包 tsc --noEmit
```

## /status 行为要点（改这里前先读 docs/SPEC.md §2.1）

- TUI 模式：`ctx.ui.setWidget("pi-status", factory)` 编辑器上方固定 widget，同 key 原地替换（无累积、不抢焦点）
- `pi.on("input")`：用户提交下一条消息时收起 widget + 清除页脚状态（/status 本身不触发 input）
- 非 TUI 模式：`ctx.ui.notify` 单行摘要
- `getContextUsage().percent` 是 0-100 百分数，`normalizeUsagePercent` 在 index.ts 边界归一化为 0-1 比例

## 加载方式（开发期）

- 项目级：`.pi/settings.json` 的 `extensions` 指向扩展入口（绝对路径）
- 在本仓库目录启动 `pi`，信任项目后 `/status` 可用；改代码后 `/reload` 生效
