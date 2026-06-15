# VoiceCraft

一个面向本地部署的实时语音对话系统，支持 GPT-SoVITS 高级音色。

## 架构

| 组件 | 技术栈 | 端口 |
|------|--------|------|
| 前端 | Next.js 15 / React 19 | 3001 |
| 语音后端 | FastAPI + faster-whisper | 8001 |
| LLM | Ollama | 11434 |
| 高级 TTS | GPT-SoVITS（可选） | 9880 |

## 目录

- `app/`：Web UI 和 API 路由
- `components/`：聊天与录音界面
- `services/voice-backend/`：本地 ASR / TTS 服务

## 本地启动

需要按顺序启动以下服务，每个服务占一个终端窗口。

### 1. 启动 Ollama

```cmd
ollama serve
```

确保 Ollama 已安装并运行，拉取模型（按你本地实际模型名调整）：

```bash
ollama pull qwen2.5:7b-instruct
```

### 2. 启动 GPT-SoVITS（可选，用于高级音色）

```cmd
cd C:\Users\29390\OneDrive\Desktop\project\GPT-SoVITS-v2pro-20250604
runtime\python.exe api.py -s SoVITS_weights/tomori1_e12_s2664.pth -g GPT_weights/tomori1-e20.ckpt -dr "参考/みんなに届いたなら嬉しい.wav" -dt "みんなに届いたなら嬉しい" -dl ja
```

参数说明：
- `-s`：SoVITS 模型路径
- `-g`：GPT 模型路径
- `-dr`：默认参考音频路径
- `-dt`：参考音频对应文字
- `-dl`：参考音频语言（zh=中文, ja=日语, en=英文）

启动成功后会看到 `Uvicorn running on http://0.0.0.0:9880`。

### 3. 启动语音后端

```cmd
cd C:\Users\29390\OneDrive\Desktop\project\VoiceCraft
set GPT_SOVITS_URL=http://127.0.0.1:9880
services\voice-backend\.venv\Scripts\python.exe services\voice-backend\main.py
```

> 如果不用 GPT-SoVITS，跳过 `set GPT_SOVITS_URL=...` 那行即可。

启动成功后会看到 `Uvicorn running on http://0.0.0.0:8001`。

### 4. 启动前端

```cmd
cd C:\Users\29390\OneDrive\Desktop\project\VoiceCraft
npm install
npm run dev
```

启动后打开浏览器访问终端显示的地址（默认 `http://localhost:3001`）。

### 5. 前端配置 GPT-SoVITS 音色

1. 打开网页后，点击右上角 **三点菜单** → **音色设置**
2. 勾选 **"使用 GPT-SoVITS 高级音色"**
3. 参考音频路径填写：`C:\Users\29390\OneDrive\Desktop\project\GPT-SoVITS-v2pro-20250604\参考\みんなに届いたなら嬉しい.wav`
4. 参考音频文本填写：`みんなに届いたなら嬉しい`
5. 开始对话

## 环境变量

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `OLLAMA_MODEL` | Ollama 模型名 | `qwen2.5:7b-instruct` |
| `OLLAMA_CHAT_URL` | Ollama 聊天接口 | `http://127.0.0.1:11434/api/chat` |
| `VOICE_SERVICE_URL` | 语音后端地址 | `http://127.0.0.1:8001` |
| `WHISPER_MODEL` | Whisper 模型名 | `base` |
| `WHISPER_COMPUTE_TYPE` | 计算精度 | `int8` |
| `WHISPER_DEVICE` | 推理设备 | `cpu` |
| `PIPER_BIN` | Piper 可执行文件路径 | |
| `PIPER_VOICE_MODEL` | Piper 语音模型路径 | |
| `GPT_SOVITS_URL` | GPT-SoVITS 服务地址 | `http://127.0.0.1:9880` |

## 适合 RTX 4060 的建议

- 先用 `7B/8B` 级中文指令模型
- `faster-whisper small` 是更稳的起点
- TTS 先用单一音色跑通，再考虑多音色
- 如果显存只有 `8GB`，尽量别同时开太大的上下文和多个并发
