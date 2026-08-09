# TICKET-pi-web-R22-3：用户气泡 chip 渲染

## 任务
纯函数 `renderUserContent(text)`：解析 XML skill 段（`<skill name=...>`）+ 路径正则 → 段列表
（chip/文本）；Chat.tsx 用户气泡接入（替换纯文本 span）。

## 文件
- `src/client/features/chat-stream/user-content.ts`（+ test）
- `src/client/features/chat-stream/Chat.tsx`

## TDD
红：user-content.test——skill XML 段/路径/普通文本/混合
绿：实现 + Chat.tsx 接入
