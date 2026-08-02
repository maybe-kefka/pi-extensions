# @kefka/pi-status

Pi 扩展:`/status` 命令——上下文占用分类面板 + 已加载资源清单(TUI widget,不抢键盘焦点)。

## 安装

```bash
pi install npm:@kefka/pi-status
```

## 使用

在 pi TUI 中输入 `/status`:

- **上下文占用**:系统提示词 / 上下文文件 / 技能 / 工具定义 / 对话消息(按角色细分)的 tokens 估算 + 占比 bar
- **已加载资源**:skills / plugins / MCP 服务器(含 pi-mcp-adapter 工具数)
- 面板固定显示在编辑器上方,重复 `/status` 原地刷新;提交下一条消息自动收起
- 非 TUI 环境输出单行摘要

## 开发

```bash
npm test              # vitest 全量
npm run typecheck     # tsc --noEmit
```

设计规格见 monorepo 的 `docs/SPEC.md`(仓库:github.com/maybe-kefka/pi-extensions)。
