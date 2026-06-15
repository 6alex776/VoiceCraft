# GPT-SoVITS 集成指南

本指南说明如何在 VoiceCraft 中使用 GPT-SoVITS 实现高级音色（包括二次元角色声音）。

## 架构说明

VoiceCraft 采用**外部服务调用**方式集成 GPT-SoVITS：

```
VoiceCraft 前端 → Next.js API → VoiceCraft 后端 (FastAPI) → GPT-SoVITS 推理服务
```

GPT-SoVITS 作为独立进程运行，VoiceCraft 只负责转发请求。这种方式避免依赖冲突，且 GPT-SoVITS 只在需要时启动。

---

## 第一步：下载 GPT-SoVITS

### 方式一：整合包（推荐，Windows）

1. 访问 [GPT-SoVITS 官方仓库](https://github.com/RVC-Boss/GPT-SoVITS)
2. 在 Releases 或项目文档中找到**整合包下载链接**
3. 下载并解压到任意目录，例如 `C:\GPT-SoVITS`

### 方式二：手动安装（适合有 Python 经验的用户）

```bash
git clone https://github.com/RVC-Boss/GPT-SoVITS.git
cd GPT-SoVITS
pip install -r requirements.txt
```

---

## 第二步：准备模型文件

### 下载社区分享的模型

在以下平台搜索 "GPT-SoVITS 模型"：
- Hugging Face: 搜索 `GPT-SoVITS`
- Bilibili: 很多 UP 主分享模型下载链接
- 百度网盘/夸克网盘: 搜索相关资源

### 模型文件结构

下载的模型通常包含以下文件：

```
models/
  your_character/
    your_character_e8_s10480.pth      # SoVITS 模型
    your_character-e15.ckpt           # GPT 模型
    your_character.ref.wav            # 参考音频（可选，可自己准备）
```

将这些文件放入 GPT-SoVITS 的 `GPT_weights` 和 `SoVITS_weights` 目录中。

### 准备参考音频

如果没有提供参考音频，你需要自己准备：
- 录制或截取目标角色的 5-30 秒清晰语音
- 格式：WAV，单声道，22050Hz 或 24000Hz
- 保存路径记下，后续配置会用到

---

## 第三步：启动 GPT-SoVITS API 服务

### 启动推理 WebUI

进入 GPT-SoVITS 目录，运行：

```bash
# Windows
runtime\python.exe api.py

# 或如果你手动安装的 Python
python api.py
```

默认会启动在 `http://127.0.0.1:9880`

### 验证服务是否启动

在浏览器访问：
```
http://127.0.0.1:9880/
```

如果看到空白页或 405 错误，说明服务已启动（它只接受 POST 请求）。

---

## 第四步：配置 VoiceCraft

### 设置环境变量

在启动 VoiceCraft 后端之前，设置环境变量指向 GPT-SoVITS 服务：

```powershell
# PowerShell
$env:GPT_SOVITS_URL="http://127.0.0.1:9880"

# 然后启动 VoiceCraft 后端
python services/voice-backend/main.py
```

或者在 Windows 系统设置中添加永久环境变量 `GPT_SOVITS_URL`。

### 验证连接

启动 VoiceCraft 后端后，查看日志：
- 如果 GPT-SoVITS 可用，日志会显示连接成功
- 前端"音色设置"中的 GPT-SoVITS 开关会变为可用状态

---

## 第五步：前端使用

1. 打开 VoiceCraft 网页
2. 点击底部的**"音色设置"**按钮
3. 勾选**"使用 GPT-SoVITS 高级音色"**
4. 填写参数：
   - **参考音频路径**：填写你准备的 `.wav` 文件完整路径，例如 `C:\voices\character_ref.wav`
   - **参考音频文本**：填写该音频中角色说的文字内容
   - **语速**：调整输出语速（0.5x ~ 2.0x）
5. 关闭设置面板，开始对话

---

## 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| `ref_wav_path` | 参考音频的完整文件路径 | `C:\voices\ref.wav` |
| `prompt_text` | 参考音频对应的文字 | `你好，我是你的AI助手。` |
| `speed` | 语速倍数 | `1.0` 正常，`1.2` 稍快，`0.8` 稍慢 |

---

## 故障排除

### GPT-SoVITS 开关显示"服务未启动"

1. 确认 GPT-SoVITS 已启动在 `http://127.0.0.1:9880`
2. 确认 `GPT_SOVITS_URL` 环境变量已设置
3. 刷新 VoiceCraft 网页重新检测

### 合成失败或超时

1. 检查参考音频路径是否正确（使用完整绝对路径）
2. 检查参考音频格式是否为 WAV
3. 检查 GPT-SoVITS 控制台是否有错误输出
4. 首次推理较慢（需要加载模型），请耐心等待

### 声音不像目标角色

1. 更换质量更好的参考音频（更清晰、更像目标角色）
2. 确保 `prompt_text` 与参考音频内容完全对应
3. 尝试不同的社区模型

---

## 注意事项

- GPT-SoVITS 推理需要一定时间（CPU 5-15秒，GPU 1-3秒），请耐心等待
- 参考音频质量直接影响合成效果，建议使用 5-10 秒的高质量音频
- 本集成仅支持 GPT-SoVITS 的**推理功能**，训练新模型需要在 GPT-SoVITS 原界面操作
