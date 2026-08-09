# TICKET-pi-web-R21-3：@ 空态文案区分

## 任务
MentionMenu 加 `emptyLabel` prop；InputBar 计算：
- kind === "file" && files.length === 0 → "当前目录无文件可引用"
- kind === "file" && files.length > 0 → "无匹配文件"
- 其他 → "无匹配项"

## 文件
- `src/client/features/input-bar/MentionMenu.tsx`
- `src/client/features/input-bar/InputBar.tsx`
- `src/client/features/input-bar/InputBar.test.tsx`

## TDD
红：InputBar.test.tsx——空 files 触发 @ → "当前目录无文件可引用"；有 files 过滤空 → "无匹配文件"
绿：实现
