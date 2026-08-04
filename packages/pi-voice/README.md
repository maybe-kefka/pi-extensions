# @kefka/pi-voice

Pi 扩展：`/voice` 命令 —— 用本地 whisper.cpp 离线把音频转写为中文文本。

## 前置依赖（宿主环境）

Termux 上需要已构建的 whisper.cpp（与包解耦，路径可配置）：

```bash
# ~/whisper.cpp 下：build/bin/whisper-cli + models/ggml-base-q5_0.bin
# 构建与模型下载步骤见 docs/SPEC.md；或设置环境变量指定路径：
#   PI_VOICE_CLI=/path/to/whisper-cli
#   PI_VOICE_MODEL=/path/to/ggml-model.bin
```

## 用法

```
/voice <音频文件>
```

- 支持 wav/mp3/m4a/aac/ogg（内部经 ffmpeg 转 16k 单声道）
- 结果以 notify 显示预览，全文写入 `<输入文件>.txt` 旁
- 30s 音频约 3s 识别（aarch64, base 量化模型）

## 开发

```bash
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

设计：`src/index.ts` 为薄接线层（不单测）；`src/transcribe.ts` 纯函数（路径解析 / 参数构建 / 输出解析），全部单测覆盖。

## 状态

- [x] 骨架 + `/voice` 命令（预留）
- [ ] 实时麦克风监听（OPPO ColorOS 权限封锁，待 Shizuku 授权后实现）
- [ ] 批量转写子命令
