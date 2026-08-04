# SPEC — @kefka/pi-voice

## 1. 背景

Termux 上已构建并验证 whisper.cpp 离线中文识别（详见 `~/whisper.cpp/存档说明.md`）。
本包把该能力暴露为 pi 扩展命令 `/voice`，与 `pi-status` 等包同构（薄接线 + 纯函数 + TDD）。

## 2. 需求

### 2.1 /voice 命令

- 语法：`/voice <音频文件>`；无参显示用法提示
- 行为：调用本地 whisper-cli 转写为中文文本
  - 输入路径：绝对路径原样使用；相对路径基于 `process.cwd()`
  - 输出：`ctx.ui.notify` 显示字数 + 预览（48 字截断）+ 全文写入 `<输入>.txt`
  - 错误：文件不存在 / whisper 未就绪 / 无识别内容 / 超时（300s）→ notify error

### 2.2 whisper 运行时定位（可配置）

- 默认路径（Termux 规范布局）：`$HOME/whisper.cpp/build/bin/whisper-cli`、`$HOME/whisper.cpp/models/ggml-base-q5_0.bin`
- 环境变量覆盖：`PI_VOICE_CLI`、`PI_VOICE_MODEL`
- 缺失时提示安装指引（不自动下载）

### 2.3 非目标（预留）

- 实时麦克风常驻监听：依赖 OPPO 权限解锁（Shizuku），后续 ticket
- 批量转写、翻译（`-tr`）等参数透传：后续迭代

## 3. 模块划分

- `src/index.ts` — 薄接线：命令注册、spawn、I/O、notify（不单测）
- `src/transcribe.ts` — 纯函数：
  - `resolveWhisperPaths(env)` — 路径解析
  - `buildTranscribeArgs({model,input,language?,noTimestamps?})` — argv
  - `parseTranscribeOutput(stdout)` — 过滤 whisper 日志/timings，保留文本
  - `renderNotReady(missing)` — 未就绪提示

## 4. 验收

- [x] 纯函数单测全绿（`npm test`）、typecheck 通过
- [x] 端到端：对真实录音文件（`~/whisper.cpp/phone_test.wav`）转写成功（人工验证）
- [ ] 加载进 pi 后 `/voice` 可用（依赖 .pi/settings.json 加载，人工验收）
