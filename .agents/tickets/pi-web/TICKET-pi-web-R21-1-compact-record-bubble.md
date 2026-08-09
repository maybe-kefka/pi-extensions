# TICKET-pi-web-R21-1：compact 聊天流记录气泡（去横幅）

## 任务
Chat.tsx 删除 compact-banner；compact-record 支持 before/done 双态。
- before：Loader2 转圈 + "正在压缩上下文…（{原因}）"（同款圆角 badge）
- done：现有"上下文已压缩（{原因}）"（willRetry 附"· 将重试上一条消息"）
- 渲染条件：`compacting?.phase === "before" || "done"`

## 文件
- `src/client/features/chat-stream/Chat.tsx`
- `src/client/features/chat-stream/Chat.test.tsx`

## TDD
红：更新 Chat.test.tsx——before 断言从 banner 改为 record（转圈 + 文案）；banner 断言移除
绿：Chat.tsx 实现
