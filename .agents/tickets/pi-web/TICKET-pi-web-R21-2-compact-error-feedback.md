# TICKET-pi-web-R21-2：compact 错误反馈

## 任务
rpc-handler `pi:compact`：`requireCtxOf().compact({ onError })` → onError → `console.broadcast("notify", { message: "压缩失败：…", notifyType: "error" })`。
小会话（Nothing to compact）/已压缩（Already compacted）等 pi 端异常不再静默。

## 文件
- `src/server/interface/rpc-handler.ts`

## TDD
红：无直接单测（interface 薄层）——浏览器冒烟验证（小会话点击压缩 → 侧栏"压缩失败"通知）
绿：rpc-handler 实现
