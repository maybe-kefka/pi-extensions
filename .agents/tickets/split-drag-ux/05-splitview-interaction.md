# 05 — 分栏视图交互：预览守卫 + join 高亮/drop + 高亮 = 实际结果

**What to build:** 分栏视图（leaf 容器）的拖拽交互按 VSCode 模型落地：预览守卫（拖拽 tab 的源组 = 目标组 且源组仅 1 个 tab → 不预览、drop 无效果）；中央 dragover → join 高亮（整容器淡高亮）、drop → join（并入目标组末尾并激活）；边缘高亮 = 实际拆分半区（50%，四向统一），不再是 25% 命中区；跨组边缘 drop → 拆分（语义由领域层承载）。接线：join → 移动 action（toId = null），拆分 → 既有拆分 action。

**Blocked by:** 01 — split-tree-domains（落点判定返回 join、拆分支持跨组是前置）

**Status:** ready-for-agent

- [ ] 预览守卫：源组 = 目标组 且 tabs=1 → dragover 无高亮、drop 无效果；拖到其他组正常
- [ ] 中央 dragover → join 高亮（整容器）；drop → join 回调
- [ ] 边缘高亮 = 实际半区（左/右/上/下 50%）
- [ ] 跨组边缘 drop → 拆分回调生效（源组移除 + 目标组拆分 + 空组回收）
- [ ] 拖拽结束/取消后所有高亮清除（既有清理路径保持）
- [ ] 全量测试绿：npm test（该组件单测更新：中央"无高亮不触发"断言 → join 行为）+ typecheck
