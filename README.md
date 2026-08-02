# pi-extensions

个人 pi 扩展 monorepo（npm workspaces）。包名模式：`@kefka/pi-*`。

## 结构

```
packages/pi-status/   # /status 命令：上下文占用分类 + 已加载资源
├── src/              # index.ts(接线) + widget(组件) + context/format/resources/mcp-config(纯函数)
└── test/             # vitest 单测（TDD）
docs/                 # 规格与任务清单
├── SPEC.md           # 规格
└── TICKETS.md        # 任务清单
```

## 开发流程

```bash
npm install
npm test              # vitest 全量
npm run typecheck     # 各包 tsc --noEmit
```

## 加载方式（开发期）

项目级加载，不影响全局 pi：

- `.pi/settings.json` 的 `extensions` 字段指向扩展入口（**绝对路径**，pi 的 project settings 按绝对路径解析）
- 在本仓库目录启动 `pi`，首次启动信任项目后 `/status` 可用
- 改代码后 `/reload` 生效

## 发布

`@kefka/pi-status` 已发布到 npm。安装：

```bash
pi install npm:@kefka/pi-status   # 从 npm
pi install ./packages/pi-status   # 本地路径（开发）
```

发布新版本：

```bash
npm run publish:pi-status   # prepublishOnly 自动跑 typecheck + test
```
