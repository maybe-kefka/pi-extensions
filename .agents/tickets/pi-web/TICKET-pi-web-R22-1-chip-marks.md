# TICKET-pi-web-R22-1：chip 标记机制

## 任务
chip data-insert 改为标记文本：skill → `\u0001skill:{name}\u0001`、file → `\u0001file:{path}\u0001`。
`serializeContent` 输出标记文本。纯函数 `parseChipMarks(text)` 解析为段列表。

## 文件
- `src/client/features/input-bar/chip-serialize.ts`（+ test）
- `src/client/features/input-bar/InputBar.tsx`（insertChip data-insert）

## TDD
红：chip-serialize.test——标记常量/parseChipMarks（skill/file/混合/无标记）
绿：实现
