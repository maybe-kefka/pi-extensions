# 01 — preview 模型（单击预览 / 双击转正 / 编辑转正）

**What to build:** 文件 tab 预览语义：tabs 状态机扩展（文件 tab 加 preview 字段；openFile 支持 preview 模式——已有 preview tab 时先关闭（全局唯一）；promotePreview 转正；diff tab 类型预留）；文件树单击 = preview 打开、双击/Enter = 转正；编辑（dirty 上报）自动转正；TabsBar 预览 tab 斜体展示。预览关闭/替换时 dirty 三选照旧。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] tabs 状态机单测：预览打开替换唯一性 / promote / 编辑转正 / 同文件幂等
- [ ] 文件树单击 preview + 双击/Enter 转正；TabsBar 预览斜体
- [ ] 编辑 preview 文件自动转正（dirty 上报联动）
- [ ] `npm test` + `npm run typecheck` 全绿；浏览器冒烟：单击斜体 → 单击另一文件替换 → 双击转正 → 编辑转正

