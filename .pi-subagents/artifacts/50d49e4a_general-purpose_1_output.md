所有证据已收集完毕。汇总核对结果，输出报告。

**审查结论摘要：**

关键事实链（均已用 `git show` 验证）：SPEC 最后一次修改在 cf1a14f（"SPEC/TICKETS reality sync"），其 §4.1 写"替换方案（buildStatusNotificationArgs/buildStatusContent）已删除"；但后续 ed4a9b1（分场景 remove vs replace）+ 90f2e07（2s 自动消失）重新启用了替换机制，而 995c5f2 的"sync"提交只改了 TICKETS/AGENTS/README，**未碰 SPEC**。因此 SPEC §4.1 与最终实现直接矛盾。

以下为完整报告（将持久化到指定路径）：

```markdown
# Spec 轴审查报告 — pi-notify-termux（276b403...HEAD）

基点 276b403 为包开发前；13 提交全覆盖。SPEC/TICKETS 全文已读，8 个 src 模块 + 7 个测试文件逐行核对；工作树无未提交改动。

## (a) SPEC 要求但缺失/部分实现
1. **`ctx.isIdle()` 未显式检查**（SPEC §5.1 L112："触发：`pi.on("agent_settled")`，且 `ctx.isIdle() === true`、`/notify` 开启、`termux-notification` 可用"；D3 L22）：index.ts `agent_settled` 仅查 mode/enabled/envOk/文本非空，无 isIdle。事件语义通常保证 idle（pi docs extensions.md:570），但 docs 注明"除非另一扩展启动了新 run"的边缘场景下与 SPEC 字面不符。
2. **helper 防删确认缺失**（SPEC §4.2："helper 在启动与每次回复前确认存在（防用户删）"）：`ensureHelper` 仅 session_start 执行一次；agent_settled/askAndWait 发送通知前不复查 helper 存在。
3. **权限提示为死分支**（SPEC §5.3：`/notify` 无参显示"含 Termux 环境/权限提示"）：`renderStatus` 的 `permOk` 参数在接线层恒传 true（index.ts），"⚠️ Android 13+ 需授予通知权限"警告永不显示（envOk 提示正常）。

## (b) SPEC 没要求的行为（范围蔓延——均记录在 TICKETS，但 SPEC 未同步）
1. **替换+2s 自动消失机制**（78e8a18→ed4a9b1→90f2e07）：SPEC §4.1 L92 明言"替换方案（buildStatusNotificationArgs/buildStatusContent）**已删除**"，但最终代码保留两者并在 Direct Reply 路径使用（`replaceWithStatus` + `AUTO_DISMISS_MS=2000`；ask input 回复、需求 1 回复均走替换而非 remove）。995c5f2"sync auto-dismiss"只改 TICKETS/AGENTS/README；SPEC 停在 cf1a14f 中间态 → **SPEC §4.1 与最终实现直接矛盾，权威文档失真**（TICKETS 忠实，SPEC 未忠实）。
2. **打开终端 action 追加 `|| termux-toast 后台启动被拒…` 降级**（55fdab0）：SPEC §4.1 button2-action 字面无此内容；TICKETS 偏差节有记录，SPEC §4.1 未同步。
3. 次要：`smoke.mjs`（SPEC/TICKETS 均未提及，开发期自检脚本）；`helper.ts` 独立模块（SPEC 模块表归 index.ts"helper 生成"，属符合纯函数原则的合理抽取）。

## (c) 疑似错误
1. **selection 类型不符**：SPEC §5.2 L119 返回 `selection: "N"`（字符串），实现为 number（index.ts `Number(reply.text)`、ask.ts `selection: 2`，测试按 number 断言）——LLM 可见 JSON 类型差异；数字更合理，但 SPEC 字面未对齐。
2. **需求 1 回复终结反馈方式**：SPEC §4.1"需求 1 回复时扩展侧调用 termux-notification-remove"，实现为替换+2s 自动移除（同上，SPEC 失真）。
3. judgement call：agent_end 缓存"最后一条**非空** assistant 文本"，SPEC §5.1 为"最后一条 assistant 消息"；末条为空时实现取更早一条弹通知——与"空消息不弹"意图存在张力，可接受。

## 一致确认
D1 砍需求忠实记录（§1.3/§1.4，无 focus 代码）；D8 仅 TUI 双守卫 ✓；§5.2 tool 参数（question 必填、options 1–3 超 3 报错、timeout 默认配置 300/0=不超时、question 回显、cancelled/timeout 语义）✓；§5.3 on/off/未知参数报错 ✓；§5.4 轮询 500ms、消费即删、启动清空 replies/、notify/ask 前缀隔离 ✓；§4.1 固定 id 原地更新、ask-<id>、`$REPLY` 字面、空输入=取消、termux-am、on-delete 仅 ask ✓；§4.2 helper 绝对路径、printf 防注入 ✓；D10 路径构建与 peerDependencies/typebox 声明 ✓。

## 结论
实现与 SPEC 主体一致，无功能级 blocker；**主要问题在终结反馈段：SPEC §4.1 未同步最终机制（ed4a9b1+90f2e07），是唯一"SPEC 被实现甩开"的失真点**，建议按最终代码重写该段并删除"已删除"字样。
```