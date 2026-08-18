# 01 — Theme contract 与对比度基础

**What to build:** 让现有 5×2 主题拥有完整、可验证且可扩展的语义视觉契约。用户切换任何现有主题时，基础画布、文字、控件与状态都保持协调可读；维护者只修改主题目录即可得到确定性 CSS，并能在生成结果漂移或关键颜色组合不达标时立即获得明确失败。

**Blocked by:** None — can start immediately

**Status:** completed (`086b835`)

- [x] 保留全部现有 theme ID、名称、light/dark 变体、偏好格式及 GitHub/System 默认行为
- [x] 主题契约覆盖本迭代实际使用的 surface、interactive、status 与 syntax roles，同时保留迁移期旧消费者可用
- [x] 10 个 palette 的普通文字、辅助文字、主要操作、状态、focus 与关键控件组合达到 SPEC 对比度门槛
- [x] CSS 生成是纯、确定性的深模块 interface，主题目录是唯一 palette 事实源
- [x] 已提交主题 CSS 与生成结果存在自动 drift gate，失败能指出不一致
- [x] 测试覆盖全部 10 个变体的 token 完整性、兼容性、颜色有效性和对比度，且不锁定内部实现
- [x] 现有主题即时切换、系统跟随、首帧应用和持久化行为不回归
- [x] `npm test` 与 `npm run typecheck` 通过
