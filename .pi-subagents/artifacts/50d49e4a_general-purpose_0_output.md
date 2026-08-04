所有源码、测试、SPEC/TICKETS 与参照包已读完。以下为审查报告（正文 ≤400 词）。

---

# Standards 审查报告：pi-notify-termux（`git diff 276b403...HEAD`）

**合规确认**：SPEC/TICKETS/TDD 流程齐备（7 个纯函数模块各有测试，提交与 ticket 一一对应）；`import type` 合规（`CONFIG_DIR_NAME`/TypeBox 值导入为包 AGENTS 明示例外）；运行时零 npm 依赖（package.json 仅 devDependencies/peer）；无发布动作（仅新增 `publish:pi-notify-termux` script）；strict/verbatimModuleSyntax 由工具链强制，跳过。

## (a) 硬违规（文档化标准）

1. **src/index.ts — 薄接线层越界**（包 AGENTS.md「index.ts 薄接线，不写业务逻辑、不做单测；其余模块纯函数 + TDD」；根 AGENTS.md 同）：
   - `extractAssistantText`/`textFromContent`（index.ts:375-403）：约 30 行消息解析业务逻辑，零单测，应下沉 format.ts 走 TDD；
   - poll() 内选项序号→selection/option 映射、空输入判定（index.ts:147-159）：业务判定逻辑无测试（TICKETS T6 将其列为接线验收，属文档化妥协，仅降级不改性）。
   - 体量佐证：index.ts 403 行 vs 参照 pi-status index.ts ~150 行。

2. **SPEC/TICKETS 命名漂移未回写**（流程要求「SPEC→TICKETS→实现」对齐）：SPEC §4.2/TICKETS T3 的 `parseReplyFile` 实际为 `parseFileName`（replies.ts:28）；TICKETS T2 的 `buildCancelArg(id)` 实际为 `buildOnDeleteArg({id, helperPath})`（notify-cmd.ts:66）。轻微。

## (b) baseline smells（判断项）

1. **Duplicated Code — "ask-" 魔字符串**散布 4 文件 8 处：index.ts:88/101/131、notify-cmd.ts:46/55、replies.ts:17/22、notify-list.ts:50-51。`RESULT_NOTIFICATION_ID` 已常量化，ask- 前缀未收敛。
2. **Duplicated Code — 终结反馈序列**：index.ts:96-103 与 120-125 重复「replaceWithStatus + toast 已收到回复 ✓」；remove+toast 亦两处（92-94、106-108）。
3. **Dead Code — TERMUX_TERMINAL_ACTIVITY**（index.ts:26）声明未使用；同字面量硬编码于 notify-cmd.ts:42。
4. **Speculative Generality — permOk 死分支**：两调用点（index.ts:219、325）均硬传 `permOk: true`，config.ts:86 分支不可达（T4 文档化了该字段）。
5. **Speculative Generality — encodeReplyFile/encodeCancelFile**（replies.ts:16-23）src 零使用，仅测试引用（T3 文档化）。
6. **Primitive Obsession — 重复状态联合**：format.ts:34 `"answered"|"timeout"` 与 ask.ts `AskResult.status` 重复定义，可派生。
7. **Middle Man — loadConfig**（config.ts:60-62）单行委托；**重复形状**：hasContent（format.ts）与 decodeReply 空文本判定（replies.ts:37）重复。均轻微。

## 附注（判断项）

- ask.ts:1-2 头注释称「index.ts 负责写回 ask.result」，实际 resolveAsk/cancelAsk/checkTimeout 自行突变（ask.ts:47/56/64）——注释与实现矛盾；「纯函数」标签与输入突变并存（行为已被测试锁定）。
- 包 AGENTS.md「231 tests」为全仓旧口径（实测 58+175=233），轻微文档漂移。

**Residual risks**：只读审查未运行 `npm test`/`npm run typecheck`（改动方声称 233 全绿）；(b) 各项均非阻断；(a)-1 建议后续 ticket 将消息提取/选项映射下沉纯函数层补测试。