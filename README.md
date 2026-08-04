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

三个包均已发布到 npm：`@kefka/pi-status`、`@kefka/pi-web`、`@kefka/pi-notify-termux`。安装：

```bash
pi install npm:@kefka/pi-status   # 从 npm
pi install ./packages/pi-status   # 本地路径（开发）
```

### 自动发布（推送代码即发布）

推送代码到 `main` 时，GitHub Actions 自动发布「版本有更新」的包（对比 npm registry 已发布版本，未 bump 的包自动跳过）：

```bash
npm version patch -w @kefka/pi-status   # bump 版本
npm run typecheck && npm test           # 本地先过一遍质量门
git push                                # CI：typecheck + test → 自动 npm publish
```

- 也支持 `git tag v0.1.1 && git push origin v0.1.1` 触发同样流程
- 认证走 npm Trusted Publishing (OIDC)，无需 NPM_TOKEN；前置条件：npmjs.com → Account → Trusted Publishing 配置 OIDC 主体 `owner=maybe-kefka, repo=pi-extensions, workflow=publish.yml`

### 手动发布

```bash
npm run publish:pi-status   # prepublishOnly 自动跑 typecheck + test
```
