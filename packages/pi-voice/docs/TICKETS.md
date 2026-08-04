# TICKETS — @kefka/pi-voice

## 已办（v0.1.0 骨架）

- [x] T1 包骨架：package.json / tsconfig / vitest.config / index.ts（workspace 注册）
- [x] T2 `src/transcribe.ts` 纯函数：resolveWhisperPaths / buildTranscribeArgs / parseTranscribeOutput / renderNotReady
- [x] T3 单测：transcribe.test.ts（TDD 先行）
- [x] T4 `src/index.ts` 薄接线：/voice 命令（spawn whisper-cli、notify 预览、写 .txt）
- [x] T5 文档：README / SPEC / TICKETS
- [x] T6 质量门：npm test + npm run typecheck 全绿

## 待办（未开始，需外部条件）

- [ ] T7 实时麦克风监听（OPPO ColorOS 权限封锁；需 Shizuku 授权 → appops 麦克风）
  - 循环 termux-microphone-record → /voice 转写 → 唤醒词匹配 → 动作
- [ ] T8 批量转写子命令（目录/多文件）
- [ ] T9 参数透传（-tr 翻译、语言选择、模型选择）
- [ ] T10 发布（仅用户指示后执行：bump 版本 → push main → CI 自动发布）
