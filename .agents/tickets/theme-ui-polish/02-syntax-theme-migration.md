# 02 — 代码语法色迁移

**What to build:** 让编辑器和聊天中的代码使用明确的 syntax 语义角色并完整跟随当前主题。切换任何主题后，CodeMirror 与 Markdown code block 的 keyword、type、function、string、number、operator/property 和 comment 都来自同一语义契约，chart roles 不再承担代码配色职责。

**Blocked by:** 01 — Theme contract 与对比度基础

**Status:** completed (`579eda1`)

- [x] CodeMirror 与 Markdown highlighting 消费同一组 syntax roles
- [x] 自定义主题不再回退到默认 zinc chart 变量，已确认的变量命名断链被消除
- [x] chart roles 仅保留数据可视化含义，syntax 与 chart 命名和消费者不串线
- [x] GitHub Light 与 One Dark Dark 下的编辑器、inline code 和 fenced code 均具有协调且可读的语法层级
- [x] 测试从主题/高亮公开 interface 验证 wiring，不使用手写 allowlist 掩盖缺失变量
- [x] 编辑器读写、语言加载和 Markdown 渲染行为不回归
- [x] `npm test` 与 `npm run typecheck` 通过
