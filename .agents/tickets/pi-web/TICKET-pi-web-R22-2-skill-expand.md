# TICKET-pi-web-R22-2：服务器端 skill chip 展开

## 任务
domain 层 `expandSkillChip(text, skillLookup)`（纯函数）：只展开 `\u0001skill:name\u0001` 标记段
→ `<skill name location>References are relative to {baseDir}.{body}</skill>`（stripFrontmatter，复刻 pi）；
未知 skill 保留原文。rpc-handler `pi:sendMessage` 接入（skill 元数据来自 getCommands 的 skill 命令
sourceInfo.path/baseDir）；file 标记剥离为路径。

## 文件
- `src/server/domain/skill-expand.ts`（+ test）
- `src/server/interface/rpc-handler.ts`

## TDD
红：skill-expand.test——标记展开/未知 skill/file 剥离/手打不展开/stripFrontmatter
绿：实现 + rpc-handler 接入
