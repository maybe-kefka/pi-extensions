# TICKET-pi-web-R22-5：Backspace 删除 chip 修复

## 任务
纯函数 `backspaceAtChip(root, range)`：光标在 chip 内（startContainer 是 chip）→ 返回删除动作；
InputBar keydown Backspace 分支：命中时 preventDefault + 删除 chip + 光标移到 chip 前。

## 文件
- `src/client/features/input-bar/chip-serialize.ts`（+ test）
- `src/client/features/input-bar/InputBar.tsx`

## TDD
红：chip-serialize.test——光标在 chip 内 → 删除动作；不在 → null
绿：实现 + InputBar 接入
