# VoiceCraft

一个面向本地部署的“像豆包一样”的实时语音对话骨架。

## 架构

- 前端：`Next.js / React`
- 模型：`Ollama`
- 语音：`FastAPI + faster-whisper + Piper`
- 实时输出：`SSE` 流式消息
- 编排层：保留 TEN 风格的 turn 管理接口，后续可替换成真正的 TEN Runtime / Agent Example

## 目录

- `app/`：Web UI 和 API 路由
- `components/`：聊天与录音界面
- `services/voice-backend/`：本地 ASR / TTS 服务

## 本地启动

1. 启动 Ollama，并拉取一个适合 4060 的模型。下面的名字只是示例，按你本地实际模型名调整。

```bash
ollama pull qwen2.5:7b-instruct
```

2. 启动语音服务

```bash
cd services/voice-backend
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8001
```

3. 启动前端

```bash
npm install
npm run dev
```

4. 打开

- `http://localhost:3000`

## 语音配置

- ASR：`faster-whisper`
- TTS：`Piper`
- 环境变量：
  - `WHISPER_MODEL`
  - `WHISPER_COMPUTE_TYPE`
  - `PIPER_BIN`
  - `PIPER_VOICE_MODEL`

## 适合 RTX 4060 的建议

- 先用 `7B/8B` 级中文指令模型
- `faster-whisper small` 是更稳的起点
- TTS 先用单一音色跑通，再考虑多音色
- 如果显存只有 `8GB`，尽量别同时开太大的上下文和多个并发

## 下一步

- 把 `/orchestrate` 接口替换成 TEN Runtime 中的真实 extension graph
- 增加本地知识库检索
- 加入 VAD / 打断检测 / 说话人状态机
