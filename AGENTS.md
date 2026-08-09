# pi-extensions 项目说明

个人 pi 扩展 monorepo（npm workspaces，包名模式 `@kefka/pi-*`）。包含：`packages/pi-status`（`/status` 命令——上下文占用分类面板）、`packages/pi-web`（`/web` 命令——本地 Web 控制台）与 `packages/pi-notify-termux`（Termux 通知投递 + LLM ask 工具）。

## 目录结构

```
.github/
├── workflows/publish.yml        # push main / tag v* 触发自动发布
└── scripts/publish-changed.sh   # 版本对比：只发布有更新的包
.agents/                          # 已沉淀知识（提交 git，长期保存）
├── specs/                        # 规格文档（长期）
│   ├── <pkg>/SPEC.md             # 系统基线规格（历史/技术基线，不再增长）
│   └── <slug>/SPEC.md            # 迭代规格（slug 命名，独立落盘）
└── tickets/                      # 任务票据（至少保留到完成/归档）
    ├── <pkg>/TICKET-<pkg>-R<迭代>-*.md   # R25 及以前（历史，R 迭代编号）
    └── <slug>/                   # R26 起：按迭代 slug 组织
.scratch/                         # 迭代工作区（gitignore，不提交）：<slug>/SPEC.md 草稿 + issues/NN-slug.md 草稿
packages/pi-status/
packages/pi-web/
└── src/
    ├── index.ts                  # 薄接线层（扩展入口，jiti 直载）
    ├── client/                   # 前端（FSD：app/pages/features/entities/shared）
    └── server/                   # 后端（DDD：domain/application/infrastructure/interface）
```

## 迭代流程（敏捷：迭代 = 可独立验收的增量；slug = 短横线小写英文标识）

> **规范依据三个 skill（全局 `~/.agents/skills/`，来自 mattpocock/skills）**：
> `/skill:to-spec`（对话 → SPEC）、`/skill:to-tickets`（SPEC → 垂直切片 tickets）、`/skill:tdd`（red-green 循环）。
> **每次迭代开始必须重新读取对应 skill 文件**（skill 可能更新，不依赖记忆、不保留本地模板）。

1. **对齐**：用户提需求 → grilling 逐题对齐（设计树，直至 frontier 空）→ 达成共识
2. **SPEC**：重新读取 `/skill:to-spec` 并按其流程执行 → 综合当前对话生成 SPEC 落盘 `.scratch/<slug>/SPEC.md`（模板见 skill 内 spec-template：Problem Statement / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope / Further Notes；**不写具体文件路径**；涉及既有系统规格引用基线 SPEC §X，不复述）。to-spec 要求：**先 sketch 测试 seams 并与用户确认**
3. **Tickets**：重新读取 `/skill:to-tickets` 并按其流程执行 → 垂直切片（tracer-bullet，每片窄而完整、可独立验收、单 context 窗口可完成）落盘 `.scratch/<slug>/issues/NN-slug.md`（**blockers 在前编号**，依赖顺序；模板见 skill 内 local-ticket-template：What to build / Blocked by / Acceptance criteria；**不写具体文件路径**）→ **与用户核对粒度与 blocking edges**
4. **TDD**：重新读取 `/skill:tdd` 并按其流程执行 → 按 SPEC 阶段确认的 seams 写测试（红）→ 实现（绿）→ `npm test` + `npm run typecheck` 全绿 → 提交（小步，一个 ticket 一个 commit）。tdd 要求：seams 先行（测试只写在自己确认过的 seam 上）、垂直切片推进（禁"先写全部测试再实现"的 horizontal slicing）、anti-patterns 自查（implementation-coupled / tautological）
5. **归档**：迭代完成 → SPEC 落盘 `.agents/specs/<slug>/SPEC.md`、tickets 移入 `.agents/tickets/<slug>/`、`.scratch/<slug>/` 删除
6. **验收**：浏览器/冒烟实测（前端改动）；E2E 只做冒烟，不做自动化

## 开发约定（硬约束）

- **`src/index.ts` 必须是薄接线层**：不写业务逻辑、不做单测；其余 src 模块全部纯函数 + 单测
- **类型导入用 `import type`**（`verbatimModuleSyntax` 强制）
- **运行时依赖仅 `@earendil-works/pi-tui`**；`@earendil-works/pi-coding-agent` 仅作类型导入（devDependency）
- 改动代码后必须跑 `npm test` 和 `npm run typecheck`
- **构建产物不提交 git**（`dist/` 全局忽略）：发布时 `prepublishOnly` 构建进 npm 包
- **vite 8 已验证**（2026-08，WSL2 + rolldown 新版无 SIGBUS——旧"vite 7.3.6 锁定"约束作废）
- **发布（publish）必须用户明确指示后才能执行**：用户没说"发布/推送 npm"，一律不自行 `npm publish`、不 bump 版本号；实施完成后只汇报结果，把发布作为待办等用户开口
- **不擅自 bump 版本或 push `main`**：`main` 推送会触发 CI 自动发布（见下），bump 过的包会被直接发到 npm——发版动作只有用户明确要求（如"bump 并发布"）时才做

## 常用命令

```bash
npm test              # vitest 全量
npm run typecheck     # 各包 tsc --noEmit
npm version patch -w @kefka/<pkg>   # bump 版本（发版流程第一步）
```

## 发布机制（自动）

- push `main`（或 tag `v*`）→ GitHub Actions `.github/workflows/publish.yml`：质量门（test + typecheck）→ `.github/scripts/publish-changed.sh`
- 脚本对比本地 package.json 版本与 npm registry 已发布版本，**只发布有更新的包**，已发布的自动 skip
- 认证：npm Trusted Publishing (OIDC)，无需 NPM_TOKEN；前置条件为 npmjs.com 包 Settings → Trusted Publisher 配置（owner=maybe-kefka, repo=pi-extensions, workflow=publish.yml，权限 npm publish，**2026-08 已验证生效**——pi-status 0.1.3 由 CI 发布成功）
- 用户发版流程：`npm version patch -w <pkg>` → 本地 typecheck + test → `git push` → CI 自动发布

## pi-status 行为要点（无独立规格文档，代码见 packages/pi-status/src）

- TUI 模式：`ctx.ui.setWidget("pi-status", factory)` 编辑器上方固定 widget，同 key 原地替换（无累积、不抢焦点）
- `pi.on("input")`：用户提交下一条消息时收起 widget + 清除页脚状态（/status 本身不触发 input）
- 非 TUI 模式：`ctx.ui.notify` 单行摘要
- `getContextUsage().percent` 是 0-100 百分数，`normalizeUsagePercent` 在 index.ts 边界归一化为 0-1 比例

## 加载方式（开发期）

- 项目级：`.pi/settings.json` 的 `extensions` 指向扩展入口（绝对路径，指向 `src/index.ts` 源码，jiti 直载）
- 在本仓库目录启动 `pi`，信任项目后命令可用；改代码后 `/reload` 生效
