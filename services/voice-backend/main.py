from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

# 配置日志输出
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

try:
    from faster_whisper import WhisperModel
except Exception:  # pragma: no cover - optional dependency during bootstrap
    WhisperModel = None

try:
    import pyttsx3
except Exception:  # pragma: no cover - optional dependency during bootstrap
    pyttsx3 = None


class TextPayload(BaseModel):
    text: str
    voice_id: Optional[str] = None  # Windows TTS 语音 ID 或 Piper 模型路径
    rate: Optional[int] = None      # 语速百分比 (默认 0，范围 -50 ~ 50 或更大)
    volume: Optional[int] = None    # 音量百分比 (默认 100)


class GptSoVitsPayload(BaseModel):
    text: str
    # GPT-SoVITS 推理参数
    ref_wav_path: Optional[str] = None      # 参考音频路径
    prompt_text: Optional[str] = None       # 参考音频对应的文本
    prompt_language: Optional[str] = "zh"   # 参考音频语言
    text_language: Optional[str] = "zh"     # 目标文本语言
    how_to_cut: Optional[str] = "凑四句一切"  # 文本切分方式
    top_k: Optional[int] = 20
    top_p: Optional[float] = 0.6
    temperature: Optional[float] = 0.6
    speed: Optional[float] = 1.0            # 语速倍数


app = FastAPI(title="VoiceCraft Voice Backend", version="0.1.0")
whisper_model: Optional[Any] = None
whisper_model_error: Optional[str] = None
whisper_model_name: Optional[str] = None
whisper_compute_type_loaded: Optional[str] = None
whisper_device_loaded: Optional[str] = None
whisper_local_files_only: Optional[bool] = None


def resolve_whisper_candidates() -> list[str]:
    requested_model = os.getenv("WHISPER_MODEL", "base")
    fallback_models = os.getenv("WHISPER_FALLBACK_MODELS", "base,small").split(",")

    candidates = [requested_model]
    for model_name in fallback_models:
        normalized = model_name.strip()
        if normalized and normalized not in candidates:
            candidates.append(normalized)

    return candidates


def resolve_whisper_snapshot_dir(model_name: str) -> Optional[Path]:
    normalized = model_name.strip()
    if not normalized:
        return None

    repo_name = normalized
    if not normalized.startswith("Systran/faster-whisper-"):
        repo_name = f"Systran/faster-whisper-{normalized}"

    cache_root = Path(os.getenv("HF_HOME", Path.home() / ".cache" / "huggingface"))
    repo_root = cache_root / "hub" / f"models--{repo_name.replace('/', '--')}"
    refs_main = repo_root / "refs" / "main"
    snapshots_root = repo_root / "snapshots"

    if refs_main.exists():
        revision = refs_main.read_text(encoding="utf-8").strip()
        snapshot_dir = snapshots_root / revision
        if snapshot_dir.exists():
            return snapshot_dir

    if snapshots_root.exists():
        for snapshot_dir in snapshots_root.iterdir():
            if snapshot_dir.is_dir():
                return snapshot_dir

    return None


def build_whisper_load_order() -> list[Path | str]:
    local_snapshots = []
    remote_names = []

    for model_name in resolve_whisper_candidates():
        snapshot_dir = resolve_whisper_snapshot_dir(model_name)
        if snapshot_dir is not None:
            local_snapshots.append(snapshot_dir)
        else:
            remote_names.append(model_name)

    return local_snapshots + remote_names


def resolve_compute_types() -> list[str]:
    configured = os.getenv("WHISPER_COMPUTE_TYPE")
    if configured:
        return [configured]

    whisper_device = os.getenv("WHISPER_DEVICE", "cpu").lower()
    if whisper_device == "cpu":
        return ["int8", "float32"]

    return ["float16", "int8_float16", "int8"]


def load_whisper_model() -> Optional[Any]:
    global whisper_model
    global whisper_model_error
    global whisper_model_name
    global whisper_compute_type_loaded
    global whisper_device_loaded
    global whisper_local_files_only

    if whisper_model is not None:
        return whisper_model

    if WhisperModel is None:
        whisper_model_error = "faster-whisper is not installed."
        return None

    compute_types = resolve_compute_types()
    whisper_device = os.getenv("WHISPER_DEVICE", "cpu")
    local_files_only = os.getenv("WHISPER_LOCAL_FILES_ONLY", "1").lower() not in {"0", "false", "no"}

    last_error: Optional[Exception] = None
    for model_source in build_whisper_load_order():
        for compute_type in compute_types:
            try:
                whisper_model = WhisperModel(
                    str(model_source),
                    device=whisper_device,
                    compute_type=compute_type,
                    local_files_only=local_files_only,
                )
                whisper_model_name = str(model_source)
                whisper_compute_type_loaded = compute_type
                whisper_device_loaded = whisper_device
                whisper_local_files_only = local_files_only
                whisper_model_error = None

                # 加载成功后打印日志
                logger.info("[ASR] Whisper model loaded successfully")
                logger.info("  - model_name: %s", whisper_model_name)
                logger.info("  - compute_type: %s", whisper_compute_type_loaded)
                logger.info("  - device: %s", whisper_device_loaded)
                logger.info("  - local_files_only: %s", whisper_local_files_only)

                return whisper_model
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "[ASR] Failed to load model '%s' with compute_type='%s': %s",
                    model_source,
                    compute_type,
                    exc,
                )

    whisper_model = None
    whisper_model_name = None
    whisper_compute_type_loaded = None
    whisper_device_loaded = None
    whisper_local_files_only = None
    whisper_model_error = (
        "No cached Whisper model found. Set WHISPER_MODEL to a model already cached locally, "
        "or set WHISPER_LOCAL_FILES_ONLY=0 on a machine with internet access to download one."
    )
    if last_error is not None:
        whisper_model_error = f"{whisper_model_error} Last error: {last_error}"

    logger.error("[ASR] %s", whisper_model_error)

    return whisper_model


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "asr": {
            "model_loaded": whisper_model is not None,
            "model_name": whisper_model_name,
            "compute_type": whisper_compute_type_loaded,
            "device": whisper_device_loaded,
            "local_files_only": whisper_local_files_only,
            "error": whisper_model_error,
        },
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> JSONResponse:
    model = load_whisper_model()
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                whisper_model_error
                or "faster-whisper model is not available."
            ),
        )

    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(await file.read())

    try:
        segments, _info = model.transcribe(
            str(temp_path),
            vad_filter=True,
            beam_size=1,
        )
        text_parts = [segment.text.strip() for segment in segments if segment.text.strip()]
        return JSONResponse({"text": " ".join(text_parts).strip()})
    finally:
        temp_path.unlink(missing_ok=True)


def synthesize_with_piper(text: str) -> bytes:
    piper_binary = os.getenv("PIPER_BIN")
    voice_model = os.getenv("PIPER_VOICE_MODEL")

    if not piper_binary or not voice_model:
        raise HTTPException(
            status_code=503,
            detail="Piper is not configured. Set PIPER_BIN and PIPER_VOICE_MODEL.",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_output:
        temp_output_path = Path(temp_output.name)

    try:
        process = subprocess.run(
            [piper_binary, "--model", voice_model, "--output_file", str(temp_output_path)],
            input=text.encode("utf-8"),
            check=False,
            capture_output=True,
        )

        if process.returncode != 0:
            stderr_text = process.stderr.decode("utf-8", errors="ignore")
            raise HTTPException(status_code=500, detail=stderr_text or "Piper synthesis failed")

        return temp_output_path.read_bytes()
    finally:
        temp_output_path.unlink(missing_ok=True)


def synthesize_with_windows_tts(text: str, voice_id: Optional[str] = None, rate: Optional[int] = None, volume: Optional[int] = None) -> bytes:
    if pyttsx3 is None:
        raise HTTPException(
            status_code=503,
            detail="Piper is not configured and pyttsx3 is not installed. Run pip install -r requirements.txt.",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_output:
        temp_output_path = Path(temp_output.name)

    try:
        engine = pyttsx3.init()

        # 设置语音
        if voice_id:
            voices = engine.getProperty('voices')
            matched = next((v for v in voices if v.id == voice_id or voice_id in v.id), None)
            if matched:
                engine.setProperty('voice', matched.id)
                logger.info("[TTS] Using voice: %s", matched.id)
            else:
                logger.warning("[TTS] Voice '%s' not found, using default.", voice_id)

        # 设置语速 (pyttsx3 rate 默认 200，这里做相对调整)
        if rate is not None:
            base_rate = engine.getProperty('rate')
            new_rate = int(base_rate * (1 + rate / 100))
            engine.setProperty('rate', max(50, min(400, new_rate)))
            logger.info("[TTS] Rate adjusted: %d (base %d, rate %% %d)", new_rate, base_rate, rate)

        # 设置音量 (0.0 ~ 1.0)
        if volume is not None:
            vol = max(0, min(200, volume)) / 100
            engine.setProperty('volume', vol)
            logger.info("[TTS] Volume set: %.2f", vol)

        engine.save_to_file(text, str(temp_output_path))
        engine.runAndWait()
        return temp_output_path.read_bytes()
    finally:
        temp_output_path.unlink(missing_ok=True)


@app.get("/voices")
def list_voices() -> JSONResponse:
    """列出当前可用的 TTS 语音列表（仅 Windows TTS 可用时有效）。"""
    if pyttsx3 is None:
        return JSONResponse({"voices": [], "note": "pyttsx3 is not installed."})

    engine = pyttsx3.init()
    voices = engine.getProperty('voices')
    voice_list = [
        {
            "id": v.id,
            "name": v.name,
            "languages": getattr(v, 'languages', []),
            "gender": getattr(v, 'gender', 'unknown'),
            "age": getattr(v, 'age', None),
        }
        for v in voices
    ]
    return JSONResponse({"voices": voice_list})


@app.post("/tts")
def tts(payload: TextPayload) -> Response:
    try:
        audio_bytes = synthesize_with_piper(payload.text)
    except HTTPException:
        audio_bytes = synthesize_with_windows_tts(
            payload.text,
            voice_id=payload.voice_id,
            rate=payload.rate,
            volume=payload.volume,
        )
    return Response(content=audio_bytes, media_type="audio/wav")


def get_gpt_sovits_url() -> Optional[str]:
    """获取 GPT-SoVITS 服务地址，从环境变量读取。"""
    return os.getenv("GPT_SOVITS_URL")


@app.post("/tts/gptsovits")
def tts_gptsovits(payload: GptSoVitsPayload) -> Response:
    """
    转发 TTS 请求到外部 GPT-SoVITS 推理服务。
    需要设置环境变量 GPT_SOVITS_URL，例如 http://127.0.0.1:9880
    """
    gpt_sovits_url = get_gpt_sovits_url()
    if not gpt_sovits_url:
        raise HTTPException(
            status_code=503,
            detail="GPT-SoVITS is not configured. Set GPT_SOVITS_URL environment variable.",
        )

    # 构建 GPT-SoVITS API 请求参数
    api_payload = {
        "text": payload.text,
        "text_language": payload.text_language,
        "prompt_language": payload.prompt_language,
        "how_to_cut": payload.how_to_cut,
        "top_k": payload.top_k,
        "top_p": payload.top_p,
        "temperature": payload.temperature,
        "speed": payload.speed,
    }

    # 可选的参考音频参数
    if payload.ref_wav_path:
        api_payload["ref_wav_path"] = payload.ref_wav_path
    if payload.prompt_text:
        api_payload["prompt_text"] = payload.prompt_text

    try:
        # GPT-SoVITS 默认推理接口
        response = requests.post(
            f"{gpt_sovits_url}/",
            json=api_payload,
            timeout=120,
        )
        response.raise_for_status()
        return Response(content=response.content, media_type="audio/wav")
    except requests.exceptions.ConnectionError as exc:
        logger.error("[GPT-SoVITS] Connection failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to GPT-SoVITS service. Please make sure it is running.",
        )
    except requests.exceptions.Timeout:
        logger.error("[GPT-SoVITS] Request timeout")
        raise HTTPException(status_code=504, detail="GPT-SoVITS inference timeout.")
    except Exception as exc:
        logger.error("[GPT-SoVITS] Error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/tts/gptsovits/status")
def gptsovits_status() -> JSONResponse:
    """检查 GPT-SoVITS 服务是否可用。"""
    gpt_sovits_url = get_gpt_sovits_url()
    if not gpt_sovits_url:
        return JSONResponse({"available": False, "reason": "GPT_SOVITS_URL not set"})

    try:
        response = requests.get(f"{gpt_sovits_url}/", timeout=5)
        if response.status_code == 200 or response.status_code == 405:
            # 405 表示服务在但方法不对，也说明服务活着
            return JSONResponse({"available": True, "url": gpt_sovits_url})
    except Exception as exc:
        return JSONResponse({"available": False, "reason": str(exc)})

    return JSONResponse({"available": False, "reason": "Unknown"})


@app.post("/orchestrate")
async def orchestrate(payload: Dict[str, Any]) -> JSONResponse:
    """
    This is a lightweight turn-management hook that can later be replaced by a TEN runtime app.
    """
    messages = payload.get("messages", [])
    return JSONResponse({"messages": messages, "note": "Plug this endpoint into your TEN agent graph."})
