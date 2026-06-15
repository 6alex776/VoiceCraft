@echo off
chcp 65001 >nul
echo ============================================
echo          VoiceCraft 启动脚本
echo ============================================
echo.

:: 检查 Ollama 是否在运行
echo [1/4] 检查 Ollama...
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo    Ollama 未运行，正在启动...
    start "" ollama serve
    echo    等待 Ollama 启动...
    timeout /t 5 /nobreak >nul
) else (
    echo    Ollama 已运行 ✓
)

:: 设置环境变量
echo.
echo [2/4] 配置环境变量...
set VOICE_SERVICE_URL=http://127.0.0.1:8001
set GPT_SOVITS_URL=http://127.0.0.1:9880
set OLLAMA_MODEL=qwen2.5:7b-instruct
set OLLAMA_CHAT_URL=http://127.0.0.1:11434/api/chat
echo    环境变量已配置 ✓

:: 启动语音后端
echo.
echo [3/4] 启动语音后端 (FastAPI) ...
start "VoiceCraft-Backend" cmd /k "cd /d %~dp0 && python services/voice-backend/main.py"
timeout /t 3 /nobreak >nul

:: 启动前端
echo.
echo [4/4] 启动前端 (Next.js) ...
start "VoiceCraft-Frontend" cmd /k "cd /d %~dp0 && npm run dev"
timeout /t 2 /nobreak >nul

echo.
echo ============================================
echo   所有服务已启动！
echo   前端地址: http://localhost:3000
echo   后端地址: http://127.0.0.1:8001
echo   Ollama:   http://127.0.0.1:11434
echo ============================================
echo.
echo   提示: 如需使用 GPT-SoVITS 高级音色，
echo   请单独启动 GPT-SoVITS 整合包的 api.py
echo   (端口 9880)
echo.
pause
