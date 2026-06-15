# VoiceCraft Project Handoff

This document is written for the next AI or engineer taking over the project.

## 1. What This Project Is

VoiceCraft is a local, web-based, voice-first conversational assistant inspired by a "smart companion" style UI.

The current goal is not a text chat app. The main experience is:
- voice input
- streamed model replies
- voice output
- interruption / barge-in
- a light companion-style floating UI

The intended stack is:
- Frontend: `Next.js` + `React`
- Chat LLM: `Ollama` running locally
- Voice backend: `FastAPI`
- ASR: `faster-whisper` using local Hugging Face cache
- TTS: `Piper` when configured, otherwise fallback to local Windows TTS via `pyttsx3`
- Orchestration: a TEN-style turn-taking layer later, but currently only a placeholder endpoint exists

## 2. Current User Experience

The current UI is a web-friendly split layout:
- left side: the main voice stage
- center: animated orb / waveform / status text
- right side: companion dialogue card
- bottom controls: only the basic buttons remain

Current controls:
- microphone
- interrupt
- text toggle

Removed intentionally:
- top three-dot menu
- scene selector button
- separate top text-mode button

Waveform behavior:
- no motion when idle
- motion only during active conversation states
- reacts to `recording`, `thinking`, `speaking`, and interruption cues

## 3. Repository Layout

- `app/page.tsx`: entry page, mounts the voice shell
- `app/layout.tsx`: root metadata and layout
- `app/globals.css`: all global styling and animations
- `app/api/chat/route.ts`: proxy to local Ollama streaming chat
- `app/api/voice/transcribe/route.ts`: forwards audio to the local voice backend
- `app/api/voice/tts/route.ts`: forwards text to the local voice backend
- `components/chat-shell.tsx`: main voice-first UI and client logic
- `services/voice-backend/main.py`: FastAPI ASR/TTS service
- `services/voice-backend/requirements.txt`: Python deps for the voice backend

## 4. Chat / Model Path

Text chat is routed through:
1. Browser UI
2. `Next.js` `/api/chat`
3. Local `Ollama`
4. Streamed SSE response back to the browser

Default model:
- `qwen2.5:7b-instruct`

Where this is defined:
- `app/api/chat/route.ts`

Important environment variable:
- `OLLAMA_MODEL`

Default local Ollama endpoint:
- `http://127.0.0.1:11434/api/chat`

## 5. Voice Backend Path

Voice input:
1. Browser records microphone audio
2. Browser sends audio to `/api/voice/transcribe`
3. Next.js forwards to `services/voice-backend`
4. `FastAPI` loads local Whisper snapshot
5. Transcription is returned as JSON

Voice output:
1. Browser sends assistant text to `/api/voice/tts`
2. Next.js forwards to `services/voice-backend`
3. Backend tries Piper first
4. If Piper is not configured, it falls back to `pyttsx3`
5. Audio is returned as WAV

## 6. ASR Details

The ASR backend has had a lot of environment issues, so here is the current reality:

### Current approach
- It does not rely on Hugging Face online downloads at startup
- It tries to load a local cached Whisper snapshot
- It prefers local cache first
- It falls back across candidate model names
- It tries multiple compute types if needed

### Local cache found on this machine
The machine already has this cached:
- `C:\Users\29390\.cache\huggingface\hub\models--Systran--faster-whisper-base\snapshots\ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`

This matters because:
- `Systran/faster-whisper-small` was not cached locally
- offline syncing to Hugging Face failed for `small`
- `base` is the cached snapshot that should be preferred

### Important environment variables
- `WHISPER_MODEL`
- `WHISPER_FALLBACK_MODELS`
- `WHISPER_DEVICE`
- `WHISPER_COMPUTE_TYPE`
- `WHISPER_LOCAL_FILES_ONLY`

Recommended local/offline values for this machine:
```powershell
$env:WHISPER_MODEL="base"
$env:WHISPER_FALLBACK_MODELS=""
$env:WHISPER_DEVICE="cpu"
$env:WHISPER_LOCAL_FILES_ONLY="1"
```

### Why it was failing
The most recent real root cause was:
- the model snapshot existed locally
- but the CPU backend was initially trying `int8_float16`
- that compute type is not supported efficiently on this device/backend

The backend has been updated to auto-fallback on CPU to more compatible compute types like `int8` / `float32`.

## 7. TTS Details

### Preferred path
- Piper via `PIPER_BIN` and `PIPER_VOICE_MODEL`

### Fallback path
- `pyttsx3` on Windows when Piper is not configured

### Important environment variables
- `PIPER_BIN`
- `PIPER_VOICE_MODEL`

If both are empty:
- the backend should still try local Windows TTS fallback
- if `pyttsx3` is missing, `/tts` will return `503`

## 8. Current Known Behavior / Status

### Works / intended to work
- Next.js app structure exists
- local Ollama proxy route exists
- voice-first UI exists
- microphone recording path exists
- SSE response streaming exists
- TTS fallback exists

### Known rough edges
- `README.md` currently has encoding issues in the visible text on this machine
- there is a `services/voice-backend/__pycache__` directory from previous Python runs
- the repo contains `node_modules` because dependencies have already been installed locally
- the voice backend has been iterated heavily; if anything looks odd, inspect `services/voice-backend/main.py` first

## 9. Local Setup

### Frontend
```powershell
npm install
npm run dev
```

### Voice backend
```powershell
cd services\voice-backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
.\.venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 8001
```

### Ollama
Make sure Ollama is running locally and the model exists:
```powershell
ollama pull qwen2.5:7b-instruct
```

## 10. Environment Variables

Front-end / chat:
- `OLLAMA_MODEL`
- `OLLAMA_CHAT_URL`
- `VOICE_SERVICE_URL`

ASR:
- `WHISPER_MODEL`
- `WHISPER_FALLBACK_MODELS`
- `WHISPER_DEVICE`
- `WHISPER_COMPUTE_TYPE`
- `WHISPER_LOCAL_FILES_ONLY`

TTS:
- `PIPER_BIN`
- `PIPER_VOICE_MODEL`

## 11. Debugging Checklist

If the next AI sees `503` from `/transcribe`:
1. Confirm the backend was restarted after the latest code changes
2. Confirm `WHISPER_MODEL=base`
3. Confirm `WHISPER_LOCAL_FILES_ONLY=1`
4. Confirm the local snapshot exists under the Hugging Face cache path above
5. Confirm the backend is using the CPU-safe compute type fallback

If the next AI sees `503` from `/tts`:
1. Confirm `PIPER_BIN` and `PIPER_VOICE_MODEL` are set for Piper
2. If not using Piper, confirm `pyttsx3` is installed in the voice backend venv
3. Restart the backend after changing dependencies

If text chat fails:
1. Confirm Ollama is running
2. Confirm `OLLAMA_MODEL` matches an installed local model
3. Confirm the local chat route is pointing at `http://127.0.0.1:11434/api/chat`

## 12. Design Intent

The current UI should feel:
- light
- airy
- companion-like
- more web-native than a phone UI
- minimal in button count

Do not restore a heavy chat-box-first layout unless the product direction changes.

## 13. Suggested Next Tasks

If continuing product work, the next best steps are:
1. Add a debug panel showing which ASR model and compute type were actually loaded
2. Add a clearer voice state machine for `idle / listening / thinking / speaking / interrupted`
3. Add proper local knowledge base retrieval for grounded answers
4. Add real TEN orchestration instead of the placeholder `/orchestrate` route
5. Clean up the encoding issues in `README.md`

## 14. Short Summary For Handoff

This is a local-first voice assistant web app.
The chat model is Ollama with Qwen by default.
The voice backend is FastAPI with local Whisper ASR and TTS fallback.
The UI is intentionally minimal and voice-first.
The biggest current risk area is the Whisper model loading path and CPU compute compatibility.
