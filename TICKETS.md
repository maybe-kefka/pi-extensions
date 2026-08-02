# TICKETS — @kefka/pi-status

流程：SPEC → tickets → TDD。每个功能 ticket 先写失败测试（红），再实现（绿），最后 typecheck + 全量测试通过后 commit。

## T0 仓库骨架 ✅ 进行中
- npm workspaces 根 + `@kefka/pi-status` 包脚手架
- 根 `.pi/settings.json` 项目级加载
- 验收：`npm install` 成功；`tsc --version` / `vitest --version` 可用；git 仓库已 init

## T1 format.ts（纯函数）—— TDD
文件：`src/format.ts` + `test/format.test.ts`
验收：
- `formatTokens`：千分位；0 → "0"
- `formatCompact`：128000 → "128k"；999 → "999"；2.5e6 → "2.5M"
- `formatPercent`：0.617 → "61.7%"；null → "--"
- `bar(ratio)`：0.617 → "██████░░░░"；0 → 全空；1 → 全满；clamp 到 [0,1]
- `displayWidth`：ASCII 1 宽，CJK 2 宽（用于中文 label 对齐）
- `renderBarRow`：label 对齐 + tokens + bar + percent 的单行渲染

## T2 context.ts（上下文分类）—— TDD
文件：`src/context.ts` + `test/context.test.ts`
验收：
- `estimateTextTokens(text)`：chars/4 向上取整；空串 → 0
- `computeContextBreakdown(input)`：
  - 五分类 tokens 计算口径与 SPEC §4.1 一致
  - 对话按角色归类（user/assistant/toolResult+bashExecution）
  - 分类合计与内部占比正确
  - tokens=null / 空会话 / 无 contextFiles 等边界

## T3 mcp-config.ts（MCP 配置解析）—— TDD
文件：`src/mcp-config.ts` + `test/mcp-config.test.ts`
验收：
- 配置文件优先级与 SPEC §5.3 一致（项目优先于全局）
- `mcpServers` 键解析、`disabled` 标注
- 损坏 JSON / 缺键 → 跳过不抛错
- 多文件同名服务器去重（保留首个来源）

## T4 resources.ts（plugins/skills/mcps 聚合）—— TDD
文件：`src/resources.ts` + `test/resources.test.ts`
验收：
- plugins 按 `sourceInfo.source` 去重 + 工具数/命令数统计
- skills 名称列表
- mcps 透传自 mcp-config
- 空输入不崩溃

## T5 index.ts 组装（薄层） ✅
文件：`src/index.ts` + `src/overlay.ts`
验收：
- `registerCommand("status")`；TUI → `ctx.ui.custom` 全屏 overlay（Esc/Ctrl+C 关闭，无行数上限）；非 TUI → notify 单行
- `getContextUsage()` 为 undefined 时优雅降级
- 与 T1–T4 模块接线正确

## T6 端到端验证 ✅（overlay 方案，已被 T7 取代）
验收（历史）：
- monorepo 根 `pi` 启动，项目信任后 `/status` 可用
- 面板显示总览 + 五分类 + 已加载资源（overlay 全量 16 行）；Esc 关闭
- `/reload` 后修改生效；`npm test` + `npm run typecheck` 全绿（56 tests）
- 全局 `~/.pi/agent/settings.json` 无新增条目（未污染全局）

## T7 对话框内条目渲染（appendEntry + entry-renderer） ✅
文件：`src/entry-renderer.ts` + `src/index.ts`（移除 `src/overlay.ts`）
验收：
- `registerEntryRenderer("status-panel", renderStatusEntry)` + TUI 模式 `pi.appendEntry`，快照出现在对话流（不抢键盘、无行数上限、不参与 LLM 上下文）
- **恒渲染全量面板**（`buildPanelRows` 按角色着色），不做折叠态
- `getContextUsage().percent` 为 0-100 百分数 → index.ts 边界归一化为 0-1 比例（修复 1157.4% 双乘 bug）
- `buildPanelRows` 与 `buildPanelLines` 输出一致；`renderSummaryLine` 覆盖未知 usage 边界
- 非 TUI 仍 notify 单行摘要
- `npm test` + `npm run typecheck` 全绿（63 tests）

## T8 单条目替换语义（对话不被 status 塞满） ✅
文件：`src/entry-renderer.ts` + `src/index.ts`
验收：
- 每个会话 leaf 路径只 append 一条 `status` 条目（`buildContextEntries` 判定）；后续 `/status` 不再追加
- 渲染组件每帧读模块态快照 `setStatusData()`，同一条目原地刷新；`ctx.ui.setStatus` 触发重绘 + 页脚摘要
- **重放回退**：/reload 重放先于 `session_start` 恢复，渲染器回退读条目自身数据，面板不空白
- **customType 升版** `status-panel` → `status`：旧累积条目无渲染器静默跳过
- 非 TUI 不写会话；`npm test` + `npm run typecheck` 全绿（66 tests）
