# 04 — 会话历史读取

**What to build:** 宿主按进程注册的 sessionFile 解析 jsonl 返回历史消息（现有 getMessages 解析逻辑提取为纯函数），新增 `pi:chatHistory { processId }` RPC。

**Blocked by:** 03 — 注册协议

**Status:** ready-for-agent

- [ ] session jsonl → HistoryMessage[] 解析纯函数（现有 getMessages 逻辑复用，按文件读）
- [ ] pi:chatHistory 按进程表取 sessionFile 解析；非法/缺进程 → 明确错误
- [ ] 单测（注入文件读取：消息/toolCall/toolResult 关联）；npm test + typecheck 全绿
