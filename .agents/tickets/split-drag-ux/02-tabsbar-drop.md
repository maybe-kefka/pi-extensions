# 02 — tab 栏整条可落：按 x 插入 + 竖线指示器

**What to build:** tab 栏（tablist）成为完整 drop target：有 tab 时空白区/间隙也可 drop；tab 上 drop 按落点 x 判定插入位置（tab 左半 → 插其前，右半 → 插其后，末尾空白 → 追加末尾）；拖拽悬停时显示 VSCode 式插入竖线指示器（含末尾追加位置）。同组重排与跨组移动共用同一模型（空组 drop 追加末尾的既有语义保留）。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] 插入位置解析纯函数：tab 边界列表 + 落点 x → 插入序号（0..n，n = 末尾），按中点判定
- [ ] tab 栏有 tab 时空白区/间隙 dragover 可 drop（不再只限空栏）
- [ ] tab 上 drop：x 在左半 → before，右半 → after（不再恒为 before）
- [ ] 末尾空白 drop → 追加末尾（toId = null 语义）
- [ ] 悬停指示器：before/after/末尾位置渲染竖线，dragend/drop 后清除
- [ ] 全量测试绿：npm test（该组件单测新增 + 既有）+ typecheck
