# SPEC — @kefka/pi-status

> 状态：已确认（2025-08-02 与用户逐题对齐）
> 仓库：`~/projects/pi-extensions`（npm workspaces monorepo，包名模式 `@kefka/pi-*`）

## 1. 概述

### 1.1 目标
提供 `/status` 命令，展示当前对话的上下文占用概览与构成分类占比，以及当前已加载的资源（skills / plugins / MCPs），帮助用户诊断上下文消耗来源。

### 1.2 非目标（v1 明确不做）
- 不注册 LLM 可调用的工具（仅命令）
- 不做全屏覆盖层（`ui.custom`）——v1 用 widget 面板
- 不展示 MCP 服务器的**连接状态**（扩展 API 未暴露，v1 只列出配置）
- 不引入 lint、不做构建步骤（jiti 直载 TS）
- 不发布 npm（v1 仅项目级本地加载）

### 1.3 依赖原则
- **零运行时依赖**：不 import 任何第三方运行时包
- `@earendil-works/pi-coding-agent` 仅作**类型导入**（devDependency）
- token 估算用本地 `chars/4` 启发式（与 pi 内部 `estimateTokens` 同口径），不 import 其运行时实现

## 2. 命令定义

- 名称：`status`（输入 `/status` 触发）
- 无参数；忽略多余参数
- 注册方式：`pi.registerCommand("status", { description, handler })`
- 仅命令，不注册 tool，不依赖 typebox

### 2.1 输出通道
- **TUI 模式**（`ctx.mode === "tui"`）：`ctx.ui.setWidget("pi-status", lines)` 多行面板；**8 秒后自动清除**（`setTimeout` → `setWidget(key, undefined)`）；连续调用先清除旧定时器
- **非 TUI 模式**（rpc / json / print）：降级为 `ctx.ui.notify(单行摘要, "info")`
- widget key 固定为 `"pi-status"`

## 3. 数据源

| 数据 | 来源 | 用途 |
|---|---|---|
| 总占用 tokens / contextWindow / percent | `ctx.getContextUsage()` | 总览行（**权威**，基于最后一次 assistant usage） |
| 对话消息列表 | `ctx.sessionManager.buildSessionContext()` | 按角色归类估算 tokens |
| 系统提示构成 | `ctx.getSystemPromptOptions()` | customPrompt / promptGuidelines / appendSystemPrompt / contextFiles / skills / toolSnippets |
| 活动模型 | `ctx.model` | 总览行模型名 |
| 已加载扩展与工具 | `pi.getAllTools()` + `pi.getCommands()` | plugins 清单（按 `sourceInfo.source` 去重） |
| skills 清单 | `ctx.getSystemPromptOptions().skills` | skills 区块 |
| MCP 配置 | 标准配置文件（见 §5.3） | mcps 区块（配置清单，非连接状态） |

## 4. 上下文占用区块

### 4.1 分类口径（五分类，均用 chars/4 估算）

| 分类 | 计算来源 |
|---|---|
| 系统提示词 | customPrompt + promptGuidelines.join + appendSystemPrompt（不含 contextFiles/skills/toolSnippets） |
| 上下文文件 | contextFiles 各 `path + content` |
| 技能 | skills 各 `name + description + content` |
| 工具定义 | toolSnippets 各 value（`description + promptSnippet` 的实际聚合文本） |
| 对话消息 | buildSessionContext 的消息列表按角色归类 |

对话消息内部细分：**用户 / 助手 / 工具结果**（toolResult + bashExecution 归入工具结果；custom / branchSummary / compactionSummary 归入对话合计但不单独列行，占比显示在"对话消息"行）。

### 4.2 一致性与占比基准
- 总览行：`tokens`、`percent = tokens/contextWindow` 取自 `getContextUsage()`（权威；若 `tokens` 为 null 显示"待更新"）
- 分类占比：**分母 = 五分类估算合计**（内部比例），非 usage tokens
- 面板底部显示"分类合计（≈估算）"，与总览行可能略有出入（usage 含格式开销）——属预期，SPEC 明示

### 4.3 面板结构（TUI）

```
<模型名> | 窗口: 128k | 已用: 62,500 tokens (48.8%)
────────── 上下文占用 ──────────
系统提示词      5,200 ████░░░░░░  10.4%
上下文文件      3,100 ██░░░░░░░░   6.2%
技能           1,400 █░░░░░░░░░   2.8%
工具定义        9,800 ███████░░░  19.6%
对话消息       30,500 ██████████  61.0%
  用户         12,000 ██████████  24.0%
  助手         10,200 ████████░░  20.4%
  工具结果      8,300 ██████░░░░  16.6%
──────────────
分类合计       50,000 (≈估算)
```

- bar 宽 10：`█` × round(ratio×10) + `░` × 余量
- tokens 千分位逗号；百分比一位小数
- 窗口：`128k`（< 1000 → 原值；≥ 1000 → `Math.round(n/1000)k`；≥ 1e6 → `M`）

## 5. 已加载资源区块

### 5.1 skills
- 来源：`getSystemPromptOptions().skills`（当前加载进系统提示的技能）
- 格式：`skills (3): chinese-novelist, docx, pdf`（数量 + 逗号分隔名称）

### 5.2 plugins
- 来源：`getAllTools()` + `getCommands()` 的 `sourceInfo.source` 去重（排除 builtin 工具来源，若可辨）
- 格式：`plugins (4): npm:pi-subagents (2 tools, 1 cmd), ...`——每个来源列出贡献的工具数/命令数
- 项目本地扩展（path 来源）以 basename 显示

### 5.3 mcps（方案 A：配置解析）
- 按以下优先级读取配置文件（存在即并入，服务器名去重，记录首个来源）：
  1. `<cwd>/.pi/mcp.json`
  2. `<cwd>/.mcp.json`
  3. `~/.agents/mcp.json`
  4. `~/.agents/mcp/mcp.json`
  5. `~/.config/mcp/mcp.json`
- 解析：JSON 顶层 `mcpServers` 对象的键即服务器名；`disabled: true` 的服务器标注 `(disabled)`
- 格式：`mcps (2): github (5 tools) [~/.agents/mcp.json], filesystem (8 tools) [.pi/mcp.json]`
  - 工具数 = 该来源下 `getAllTools()` 中属于 pi-mcp-adapter 插件且名称以服务器名前缀开头的工具数；无法判定时为 0 并省略 `(N tools)`
- **明确局限**：反映"已配置"，非"已连接"；连接状态 v1 不可得

## 6. 边界情况

| 场景 | 行为 |
|---|---|
| `getContextUsage().tokens === null`（compact 后） | 总览行 `已用: 待更新`，percent 显示 `--`；分类区块照常显示 |
| 空会话 / 无消息 | 对话消息行 tokens=0，bar 全空 |
| 无 MCP 配置文件 | `mcps (0)` |
| 模型无 contextWindow | 窗口显示 `--`，percent `--` |
| 配置文件 JSON 损坏/缺失 mcpServers 键 | 跳过该文件，不报错 |
| 非 TUI 模式 | 单行 notify：`context 48.8% (62,500/128,000) · skills 3 · plugins 4 · mcps 2` |

## 7. 包结构与模块职责

```
packages/pi-status/
├── package.json      # @kefka/pi-status + pi.extensions
├── tsconfig.json
├── src/
│   ├── index.ts      # 薄层：registerCommand、取 API 数据、调聚合、渲染、8s 清除
│   ├── context.ts    # 纯函数：computeContextBreakdown / estimateTextTokens
│   ├── format.ts     # 纯函数：tokens/percent/bar/displayWidth/行渲染
│   ├── resources.ts  # 纯函数：summarizeResources（skills/plugins/mcps 聚合）
│   └── mcp-config.ts # 纯函数：listMcpServers（配置发现+解析）
└── test/             # vitest：context / format / mcp-config / resources
```

- `index.ts` 不写业务逻辑、不做单测；其余模块全部纯函数 + 单测（TDD）
- 类型导入用 `import type`（`verbatimModuleSyntax` 强制）

## 8. 加载方式（开发期）

- 项目级：`.pi/settings.json` → `"extensions": ["./packages/pi-status/src/index.ts"]`
- 不进全局 `~/.pi/agent/settings.json`；不影响其他项目的 pi
- 在 monorepo 根目录启动 `pi`，项目信任后自动加载；改代码后 `/reload` 生效
- 包形态（`pi.extensions` 键）同时写好，供将来 `pi install` / 发布使用

## 9. 测试策略

- 范围：`format.ts` / `context.ts` / `mcp-config.ts` / `resources.ts` 全部纯函数
- 方法：TDD——先写失败测试（红），再实现（绿），每模块独立 commit
- 根 `npm test`（vitest run）与 `npm run typecheck` 必须全绿
