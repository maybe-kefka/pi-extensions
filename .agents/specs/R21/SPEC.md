# R21 SPEC：compact 感知落地 + @ 触发修复 + 底部间距

## 背景

R20 遗留三问题（用户验收反馈）：

1. **compact 期间页面毫无反应**——根因链（R21 侦察坐实）：
   - R20 review blocker：`App.tsx toAction` 缺 `session_before_compact`/`session_compact` case（已修 `7794eac` 前序提交）→ 事件被 `default` 丢弃
   - **`dist/` 未重建**：web 控制台运行时加载旧构建产物 → 修复不生效
   - **错误被吞**：`pi:compact` 在 rpc-handler 是 fire-and-forget（`requireCtxOf().compact()` 无 await/catch）——小会话/已压缩时 pi 抛错（`Nothing to compact` / `Already compacted`）→ unhandledRejection 静默丢失 → 用户点击"压缩上下文"（ContextPanel 已有按钮）无任何反馈
   - 修复后实测：横幅（before）+ 记录气泡（done）全链路生效
2. **`<space>@` 不触发**——根因（侦察坐实）：`@` 是 Shift+2——`mentionKey` 非激活分支无修饰键保护——Shift 的 keydown 把空格记忆 `prevWasSpace` 重置为 false → `@` 永不触发；`/` 不需要 Shift 所以正常。已修复（红→绿 + 浏览器实测 ✓）
3. **最新气泡与底部距离不足**——`MessageScrollerContent` 底边距 12px

## User Stories

**US1（P1）compact 感知完整落地**：压缩过程中与完成后，聊天流末尾显示系统记录气泡（压缩中转圈 + 文案；完成后图标/完成文案），**不再有顶部横幅**。压缩失败（会话太小/已压缩）时用户能看到错误提示。

**US2（P1）`<space>@` 触发文件面板**：空格后按 Shift+@（或任意修饰键介入后）仍触发；空目录时提示"当前目录无文件可引用"（区别于过滤无匹配的"无匹配文件"）。

**US3（P2）气泡底部间距**：最新气泡与输入区之间留 32px（`pb-8`）。

## 验收场景

### US1
- AC1：自动/手动压缩开始时，聊天流末尾出现系统记录气泡：转圈图标 + "正在压缩上下文…（{原因}）"；无顶部横幅
- AC2：压缩完成后同位置变为"上下文已压缩（{原因}）"（willRetry 时附"· 将重试上一条消息"）
- AC3：无压缩状态时无记录气泡
- AC4：压缩失败（会话太小 / 已压缩）→ 侧栏通知"压缩失败：{原因}"

### US2
- AC1：`space → Shift → @` 触发文件面板（回归测试锁定）
- AC2：`space → Control/Alt/Meta → /` 仍触发 skill 面板
- AC3：files 数据为空时 @ 面板显示"当前目录无文件可引用"；有 files 但过滤无匹配时显示"无匹配文件"

### US3
- AC1：气泡流式区底部 padding 32px（`pt-3 pb-8`）

## FR

- FR-001：Chat.tsx 删除 compact-banner；compact-record 支持 before/done 双态（before：Loader2 转圈；done：现有文案）+ willRetry 提示
- FR-002：rpc-handler `pi:compact` 传 `onError` 回调 → `console.broadcast("notify", { message: "压缩失败：…", notifyType: "error" })` → 前端 reducer notify → Sidebar 通知
- FR-003：mention.ts 非激活分支对 NAV_KEYS（修饰键/导航键）不重置 prevWasSpace（已实现，回归锁定）
- FR-004：MentionMenu 加 `emptyLabel` prop；InputBar 按 kind 与 files 总数计算空态文案
- FR-005：MessageScrollerContent `px-4 py-3` → `px-4 pt-3 pb-8`

## 非目标

- 不做 compact 进度百分比（无可靠数据源）
- 不加其他 compact 入口（ContextPanel 已有"压缩上下文"按钮）
- 不改自动 compact 触发策略（pi 内核行为）

## 技术要点

- 触发规则（R18）不变；`@` 修复是状态机修饰键保护的补充
- 错误通知走现有 `notify` → `bridge.notifies` → Sidebar 链路（无新通道）
- compact 事件链路（pi → handler → broadcast → toAction → reducer → UI）已全部验证
