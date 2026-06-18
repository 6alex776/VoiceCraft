# VoiceCraft 一键启动脚本（Windows PowerShell）
# 用法：右键 PowerShell 窗口，执行 .\start.ps1
# 首次运行可能需要先设置执行策略：Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

#requires -Version 5.1

# ==================== 用户配置区，按需修改 ====================

# 项目根目录（脚本所在目录）
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition

# GPT-SoVITS 目录，留空则不启动 GPT-SoVITS
$GptSoVitsRoot = "C:\Users\29390\OneDrive\Desktop\project\GPT-SoVITS-v2pro-20250604"

# GPT-SoVITS 模型配置
$SoVitsModel = "SoVITS_weights/刻晴_ZH_e10_s490_l32.pth"
$GptModel    = "GPT_weights/刻晴_ZH-e10.ckpt"
$RefAudio    = "参考/这么多式样、这么多质地、这么多选择…啊，这就是「消费」呀，真是令人难以抵御的魅力.wav"
$RefText     = "这么多式样、这么多质地、这么多选择…啊，这就是「消费」呀，真是令人难以抵御的魅力"
$RefLang     = "zh"

# GPT-SoVITS 推理设备：cuda 或 cpu。8GB 显存建议用 cpu，避免与 Ollama 抢显存
$GptSoVitsDevice = "cpu"

# 后端环境变量
$env:GPT_SOVITS_URL = "http://127.0.0.1:9880"

# ==================== 工具函数 ====================

function Test-CommandAvailable {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-PortInUse {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return [bool]$conn
}

function Start-ServiceWindow {
    param(
        [string]$Title,
        [string]$WorkingDirectory,
        [string]$Command
    )
    Write-Host "启动 $Title ..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd `"$WorkingDirectory`"; $Command" -WindowStyle Normal
}

# ==================== 前置检查 ====================

Write-Host "==============================================" -ForegroundColor Green
Write-Host "  VoiceCraft 一键启动脚本" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green

# 检查 Node.js
if (-not (Test-CommandAvailable "node")) {
    Write-Error "未检测到 Node.js，请先安装 Node.js 20+"
    exit 1
}

# 检查 Python
if (-not (Test-CommandAvailable "python")) {
    Write-Error "未检测到 Python，请先安装 Python 3.10+"
    exit 1
}

# 检查 Ollama
if (-not (Test-CommandAvailable "ollama")) {
    Write-Error "未检测到 Ollama，请先安装 Ollama"
    exit 1
}

# ==================== 1. 启动 Ollama ====================

if (-not (Test-PortInUse 11434)) {
    Start-ServiceWindow -Title "Ollama" -WorkingDirectory $ProjectRoot -Command "ollama serve"
    Start-Sleep -Seconds 3
} else {
    Write-Host "Ollama 已在端口 11434 运行" -ForegroundColor Yellow
}

# ==================== 2. 启动 GPT-SoVITS（可选） ====================

if ($GptSoVitsRoot -and (Test-Path $GptSoVitsRoot)) {
    if (-not (Test-PortInUse 9880)) {
        $gsovitsCmd = "runtime\python.exe api.py -s `"$SoVitsModel`" -g `"$GptModel`" -dr `"$RefAudio`" -dt `"$RefText`" -dl $RefLang --device $GptSoVitsDevice"
        Start-ServiceWindow -Title "GPT-SoVITS" -WorkingDirectory $GptSoVitsRoot -Command $gsovitsCmd
        Start-Sleep -Seconds 5
    } else {
        Write-Host "GPT-SoVITS 已在端口 9880 运行" -ForegroundColor Yellow
    }
} else {
    Write-Host "跳过 GPT-SoVITS（未配置路径或路径不存在）" -ForegroundColor Yellow
}

# ==================== 3. 启动 VoiceCraft 后端 ====================

if (-not (Test-PortInUse 8001)) {
    $backendVenv = Join-Path $ProjectRoot "services\voice-backend\.venv\Scripts\python.exe"
    if (-not (Test-Path $backendVenv)) {
        Write-Error "后端虚拟环境不存在：$backendVenv，请先运行 pip install -r services/voice-backend/requirements.txt"
        exit 1
    }

    $backendCmd = "`$env:GPT_SOVITS_URL=`"$env:GPT_SOVITS_URL`"; `"$backendVenv`" services\voice-backend\main.py"
    Start-ServiceWindow -Title "VoiceCraft 后端" -WorkingDirectory $ProjectRoot -Command $backendCmd
    Start-Sleep -Seconds 3
} else {
    Write-Host "VoiceCraft 后端已在端口 8001 运行" -ForegroundColor Yellow
}

# ==================== 4. 启动前端 ====================

if (-not (Test-PortInUse 3000)) {
    $frontendCmd = "npm run dev"
    Start-ServiceWindow -Title "VoiceCraft 前端" -WorkingDirectory $ProjectRoot -Command $frontendCmd
} else {
    Write-Host "前端端口 3000 已被占用，可能需要手动检查" -ForegroundColor Yellow
}

Write-Host "==============================================" -ForegroundColor Green
Write-Host "  启动完成，请打开浏览器访问 http://localhost:3000" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
