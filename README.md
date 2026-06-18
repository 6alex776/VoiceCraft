# VoiceCraft

一个面向本地部署的实时语音对话系统，支持 GPT-SoVITS 高级音色。

## 架构

| 组件 | 技术栈 | 端口 |
|------|--------|------|
| 前端 | Next.js 15 / React 19 | 3000（默认），若被占用则为 3001 |
| 语音后端 | FastAPI + faster-whisper | 8001 |
| LLM | Ollama | 11434 |
| 高级 TTS | GPT-SoVITS（可选） | 9880 |

## 目录

- `app/`：Web UI 和 API 路由
- `components/`：聊天与录音界面
- `services/voice-backend/`：本地 ASR / TTS 服务

## 快速启动（推荐）

Windows 用户可直接使用一键启动脚本：

```powershell
# 首次运行前设置执行策略（只需一次）
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 启动所有服务
.\start.ps1
```

启动前请编辑 `start.ps1` 顶部的 GPT-SoVITS 路径和模型配置。若不想启动 GPT-SoVITS，将 `$GptSoVitsRoot` 设为空字符串即可。

## 本地启动

### 0. 安装依赖

**前端依赖**

```cmd
cd C:\Users\29390\OneDrive\Desktop\project\VoiceCraft
npm install
```

**后端依赖**

```cmd
cd services/voice-backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

> 在 Windows 上 `pyttsx3` 用于 TTS 回退，但兼容性一般；建议优先配置 Piper 或 GPT-SoVITS。

### 1. 启动 Ollama

确保 Ollama 已安装并运行，然后拉取模型：

```bash
ollama pull qwen3.5-4b-clean
```

启动服务：

```bash
ollama serve
```

> 真实模型名在 `.env.example` 文件中修改。

### 2. 启动 GPT-SoVITS（可选，用于高级音色）

```cmd
cd C:\Users\29390\OneDrive\Desktop\project\GPT-SoVITS-v2pro-20250604
runtime\python.exe api.py -s SoVITS_weights/tomori1_e12_s2664.pth -g GPT_weights/tomori1-e20.ckpt -dr "参考/みんなに届いたなら嬉しい.wav" -dt "みんなに届いたなら嬉しい" -dl ja
runtime\python.exe api.py -s SoVITS_weights/刻晴_ZH_e10_s490_l32.pth -g GPT_weights/刻晴_ZH-e10.ckpt -dr "参考/这么多式样、这么多质地、这么多选择…啊，这就是「消费」呀，真是令人难以抵御的魅力.wav" -dt "这么多式样、这么多质地、这么多选择…啊，这就是「消费」呀，真是令人难以抵御的魅力" -dl zh
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

启动后打开浏览器访问终端显示的地址（默认 `http://localhost:3000`，若 3000 被占用则可能是 `http://localhost:3001`）。

### 5. 前端配置 GPT-SoVITS 音色

1. 打开网页后，点击右上角 **三点菜单** → **音色设置**
2. 勾选 **"使用 GPT-SoVITS 高级音色"**
3. 参考音频路径填写：`C:\Users\29390\OneDrive\Desktop\project\GPT-SoVITS-v2pro-20250604\参考\みんなに届いたなら嬉しい.wav`或`C:\Users\29390\OneDrive\Desktop\project\GPT-SoVITS-v2pro-20250604\参考\这么多式样、这么多质地、这么多选择…啊，这就是「消费」呀，真是令人难以抵御的魅力.wav`
4. 参考音频文本填写：`みんなに届いたなら嬉しい`或`这么多式样、这么多质地、这么多选择…啊，这就是「消费」呀，真是令人难以抵御的魅力`
5. 开始对话

## 环境变量

在项目根目录创建 `.env` 文件（参考 `.env.example`）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `OLLAMA_MODEL` | Ollama 模型名 | `qwen3.5-4b-clean` |
| `OLLAMA_CHAT_URL` | Ollama 聊天接口 | `http://127.0.0.1:11434/api/chat` |
| `VOICE_SERVICE_URL` | 语音后端地址 | `http://127.0.0.1:8001` |
| `WHISPER_MODEL` | Whisper 模型名 | `base` |
| `WHISPER_COMPUTE_TYPE` | 计算精度 | `int8` |
| `WHISPER_DEVICE` | 推理设备 | `cpu` |
| `PIPER_BIN` | Piper 可执行文件路径 | |
| `PIPER_VOICE_MODEL` | Piper 语音模型路径 | |
| `GPT_SOVITS_URL` | GPT-SoVITS 服务地址 | `http://127.0.0.1:9880` |

## 适合 RTX 4060 的建议

- LLM 用 `qwen3.5-4b-clean`，4B 参数在 8GB 显存上速度更快
- ASR 用 `faster-whisper base`，中文日常对话够用
- TTS 先用 Piper 或单一 GPT-SoVITS 音色跑通，再考虑多音色
- GPT-SoVITS 与 Ollama 同时运行时容易爆显存，建议 GPT-SoVITS 用 `--device cpu` 启动
- 如果显存只有 `8GB`，尽量别开太大的上下文长度和并发
