'use client';

import { useEffect, useRef, useState } from 'react';

/** 消息类型 */
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

/** 语音状态机 */
type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';

function createMessageId() {
  return crypto.randomUUID();
}

/** 根据状态返回状态文案 */
function statusLabel(status: VoiceStatus, cue: string | null) {
  if (cue) return cue;
  switch (status) {
    case 'listening': return '正在听你说…';
    case 'thinking': return '正在思考…';
    case 'speaking': return '正在回应…';
    case 'interrupted': return '已打断';
    default: return '你可以开始说话';
  }
}

/** 波形条高度数据 */
function waveformBars() {
  return [14, 18, 26, 34, 42, 52, 38, 26, 18, 28, 40, 34, 22, 16, 20, 32, 44, 30];
}

/** 解析 SSE 流 */
async function readSseStream(
  response: Response,
  onDelta: (delta: string) => void,
  onDone: () => void,
) {
  if (!response.body) throw new Error('No response stream available.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let sepIdx = buffer.indexOf('\n\n');
    while (sepIdx !== -1) {
      const raw = buffer.slice(0, sepIdx).trim();
      buffer = buffer.slice(sepIdx + 2);
      for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        const parsed = JSON.parse(payload) as { delta?: string; done?: boolean };
        if (parsed.delta) onDelta(parsed.delta);
        if (parsed.done) onDone();
      }
      sepIdx = buffer.indexOf('\n\n');
    }
  }
}

/** 波形可视化组件 */
function Waveform({ status, cuePulse }: { status: VoiceStatus; cuePulse: boolean }) {
  const isActive = status !== 'idle' || cuePulse;
  return (
    <div className={`waveform ${isActive ? 'visible active' : ''}`} aria-hidden="true">
      {waveformBars().map((h, i) => (
        <span
          key={`${h}-${i}`}
          className="waveform-bar"
          style={{ animationDelay: `${i * 55}ms` }}
        />
      ))}
    </div>
  );
}

export function ChatShell() {
  /* ---------- 状态定义 ---------- */
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: createMessageId(), role: 'assistant', content: '我在。你可以直接说话，我会尽量像真人一样接住你的话。' },
  ]);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [panelWidth, setPanelWidth] = useState(420); // 侧边栏可拉伸宽度
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interruptCue, setInterruptCue] = useState<string | null>(null);

  // TTS 音色设置
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [voiceId, setVoiceId] = useState<string>('');
  const [voiceRate, setVoiceRate] = useState<number>(0);
  const [availableVoices, setAvailableVoices] = useState<{ id: string; name: string }[]>([]);

  // GPT-SoVITS 设置
  const [useGptSoVits, setUseGptSoVits] = useState(false);
  const [gptSoVitsAvailable, setGptSoVitsAvailable] = useState(false);
  const [gptSoVitsRefAudio, setGptSoVitsRefAudio] = useState('');
  const [gptSoVitsPromptText, setGptSoVitsPromptText] = useState('');
  const [gptSoVitsSpeed, setGptSoVitsSpeed] = useState(1.0);

  /* ---------- 引用 ---------- */
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const interruptTimerRef = useRef<number | null>(null);

  // VAD 相关
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number>(0);
  const isSpeakingRef = useRef<boolean>(false);

  /* ---------- 计算属性 ---------- */

  // 是否显示停止按钮（录音中/思考中/说话中）
  const showStopBtn =
    status === 'listening' || status === 'thinking' || status === 'speaking';

  /* ---------- 初始化：获取语音列表 & GPT-SoVITS 状态 ---------- */
  useEffect(() => {
    // 获取 Windows TTS 可用语音列表
    async function fetchVoices() {
      try {
        const res = await fetch('/api/voice/voices');
        if (res.ok) {
          const data = (await res.json()) as { voices: { id: string; name: string }[] };
          setAvailableVoices(data.voices || []);
        }
      } catch { /* 静默失败 */ }
    }
    fetchVoices();

    // 检测 GPT-SoVITS 服务是否可用
    async function checkGptSoVits() {
      try {
        const res = await fetch('/api/voice/gptsovits/status');
        if (res.ok) {
          const data = (await res.json()) as { available: boolean };
          setGptSoVitsAvailable(data.available);
        }
      } catch {
        setGptSoVitsAvailable(false);
      }
    }
    checkGptSoVits();
  }, []);

  /* ---------- 清理副作用 ---------- */
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (interruptTimerRef.current) window.clearTimeout(interruptTimerRef.current);
      stopVad();
    };
  }, []);

  // 打断提示自动消失
  useEffect(() => {
    if (!interruptCue) return;
    if (interruptTimerRef.current) window.clearTimeout(interruptTimerRef.current);
    interruptTimerRef.current = window.setTimeout(() => {
      setInterruptCue(null);
      interruptTimerRef.current = null;
    }, 900);
  }, [interruptCue]);

  /* ========== TTS 语音合成 ========== */

  async function playSpeech(text: string) {
    // 先停止当前播放
    audioRef.current?.pause();
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    let response: Response;

    if (useGptSoVits && gptSoVitsAvailable) {
      // 走 GPT-SoVITS 高级音色
      response = await fetch('/api/voice/tts/gptsovits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          ref_wav_path: gptSoVitsRefAudio || undefined,
          prompt_text: gptSoVitsPromptText || undefined,
          speed: gptSoVitsSpeed,
        }),
      });
    } else {
      // 默认 TTS（Piper / Windows TTS）
      response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice_id: voiceId || undefined,
          rate: voiceRate || undefined,
        }),
      });
    }

    if (!response.ok) return;

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    audioUrlRef.current = audioUrl;

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    setStatus('speaking');

    audio.onended = () => {
      setStatus('idle');
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };

    await audio.play();
  }

  /* ========== 对话请求 ========== */

  async function submitChat(nextMessages: ChatMessage[], assistantMessageId: string) {
    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setStatus('thinking');
    setErrorMessage(null);

    let assistantText = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`Chat request failed: ${response.status}`);

      // 流式读取 SSE
      await readSseStream(
        response,
        (delta) => {
          assistantText += delta;
          setMessages((current) =>
            current.map((m) =>
              m.id === assistantMessageId ? { ...m, content: assistantText } : m,
            ),
          );
        },
        () => { setStatus('idle'); },
      );

      // 文本完成后播放语音
      if (assistantText.trim()) void playSpeech(assistantText);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const msg = error instanceof Error ? error.message : '模型请求失败';
      setErrorMessage(msg);
      setStatus('idle');
    }
  }

  /* ========== 发送消息（文本输入） ========== */

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg = { id: createMessageId(), role: 'user' as const, content: trimmed };
    const assistMsg = { id: createMessageId(), role: 'assistant' as const, content: '' };
    const nextMsgs: ChatMessage[] = [...messages, userMsg];

    setMessages((cur) => [...cur, userMsg, assistMsg]);
    setTranscript(trimmed);
    setTextInput('');
    await submitChat(nextMsgs, assistMsg.id);
  }

  /* ========== 停止所有操作 / 打断 ========== */

  function stopAll() {
    const isInterrupted = status === 'listening' || status === 'speaking' || status === 'thinking';
    if (isInterrupted) setInterruptCue('已打断');

    abortRef.current?.abort();

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    audioRef.current?.pause();
    audioRef.current = null;

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    setStatus(isInterrupted ? 'interrupted' : 'idle');

    // interrupted 状态短暂显示后恢复 idle
    if (isInterrupted) {
      window.setTimeout(() => {
        setStatus((cur) => (cur === 'interrupted' ? 'idle' : cur));
      }, 900);
    }
  }

  /* ========== VAD 自动检测说话结束 ========== */

  function startVad(stream: MediaStream, recorder: MediaRecorder) {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;
    silenceStartRef.current = 0;
    isSpeakingRef.current = false;

    const dataArr = new Uint8Array(analyser.frequencyBinCount);

    // VAD 参数配置
    const SPEECH_THRESHOLD = 15;   // 音量阈值 (0-255)
    const SILENCE_TIMEOUT = 1200;   // 静音超时 (ms)
    const MIN_SPEECH_DURATION = 600; // 最短说话时长 (ms)

    let speechStartTime = 0;

    vadIntervalRef.current = window.setInterval(() => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArr);

      // 计算平均音量
      let sum = 0;
      for (let i = 0; i < dataArr.length; i++) sum += dataArr[i];
      const avg = sum / dataArr.length;

      const now = Date.now();

      if (avg > SPEECH_THRESHOLD) {
        // 检测到声音
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          speechStartTime = now;
        }
        silenceStartRef.current = 0;
      } else {
        // 检测到静音
        if (isSpeakingRef.current) {
          if (silenceStartRef.current === 0) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current > SILENCE_TIMEOUT) {
            // 静音超时 → 自动停止录音
            if (now - speechStartTime > MIN_SPEECH_DURATION) {
              stopVad();
              if (recorder.state !== 'inactive') recorder.stop();
            }
          }
        }
      }
    }, 100); // 每 100ms 检测一次
  }

  /** 停止 VAD 并释放资源 */
  function stopVad() {
    if (vadIntervalRef.current) {
      window.clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    isSpeakingRef.current = false;
    silenceStartRef.current = 0;
  }

  /* ========== 录音控制 ========== */

  async function startRecording() {
    setErrorMessage(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // 释放麦克风流
      stream.getTracks().forEach((t) => t.stop());
      stopVad();

      // 组装音频并发送给后端转写
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');

      setStatus('thinking');

      try {
        const response = await fetch('/api/voice/transcribe', { method: 'POST', body: formData });

        if (!response.ok) {
          const detail = await response.text();
          setStatus('idle');
          setErrorMessage(detail || '语音转写失败');
          return;
        }

        const payload = (await response.json()) as { text: string };
        setTranscript(payload.text);
        setStatus('idle');

        // 有转写文本则发送对话
        if (payload.text.trim()) await handleSend(payload.text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '语音转写请求失败';
        setErrorMessage(msg);
        setStatus('idle');
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setStatus('listening');

    // 启动 VAD 自动检测
    startVad(stream, recorder);
  }

  /** 切换录音状态（开始/停止） */
  function toggleRecording() {
    if (status === 'listening') {
      stopAll();
      return;
    }

    if (status === 'speaking' || status === 'thinking') {
      stopAll();
      return;
    }

    void startRecording().catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : '无法启动麦克风';
      setErrorMessage(msg);
      setStatus('idle');
    });
  }

  /* ========== 渲染 ========== */

  return (
    <>
      {/* ====== 顶部导航栏 ====== */}
      <header className="top-nav">
        <div className="nav-left">
          <button className="nav-btn" aria-label="菜单">
            {/* 汉堡菜单图标 */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <h1 className="nav-title">VoiceCraft 语音</h1>

        <div className="nav-right">
          {/* 三点菜单 — 用 div 包裹，避免 button 嵌套 button */}
          <div
            className="nav-btn"
            aria-label="更多选项"
            onClick={() => setShowDropdown((v) => !v)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            tabIndex={0}
          >
            {/* 三点垂直排列图标 */}
            <svg viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>

            {/* 下拉菜单 — 单一入口 */}
            <div className={`dropdown-menu ${showDropdown ? 'open' : ''}`}>
              <button
                className="dropdown-item"
                type="button"
                onClick={() => { setShowSidePanel(true); setShowDropdown(false); }}
              >
                对话面板
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ====== 主舞台区域 ====== */}
      <section className="voice-stage">
        <div className="orb-container">
          {/* 光球 */}
          <div className="orb-wrap">
            <div className="orb-glow" />
            <div className={`voice-orb ${status}`}>
              {/* 雾气斑块 — 8 个独立漂移的模糊色块，模拟水彩流动 */}
              <span className="mist mist-1" />
              <span className="mist mist-2" />
              <span className="mist mist-3" />
              <span className="mist mist-4" />
              <span className="mist mist-5" />
              <span className="mist mist-6" />
              <span className="mist mist-7" />
              <span className="mist mist-8" />
            </div>
          </div>

          {/* 状态文字 */}
          <p className={`status-text ${status !== 'idle' ? 'active' : ''}`}>
            {statusLabel(status, interruptCue)}
          </p>

          {/* 波形条 */}
          <Waveform status={status} cuePulse={Boolean(interruptCue)} />
        </div>
      </section>

      {/* ====== 底部操作栏 ====== */}
      <footer className="bottom-bar">
        {/* 纯文本输入框 + 发送按钮 */}
        <div className="input-area">
          <input
            className="text-input-field"
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="输入"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSend(textInput);
            }}
          />
          {/* 发送按钮 */}
          <button
            className="send-btn"
            type="button"
            onClick={() => handleSend(textInput)}
            aria-label="发送"
            disabled={!textInput.trim()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* 麦克风按钮 — SVG 图标 */}
        <button
          className={`mic-btn ${status === 'listening' ? 'recording' : ''}`}
          type="button"
          onClick={toggleRecording}
          aria-label={status === 'listening' ? '停止录音' : '开始录音'}
        >
          <svg viewBox="0 0 24 24">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        </button>

        {/* 停止按钮（仅在活动状态时可见）— SVG X 图标 */}
        <button
          className={`stop-btn ${showStopBtn ? 'visible' : ''}`}
          type="button"
          onClick={stopAll}
          aria-label="停止"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </footer>

      {/* ====== 侧边对话面板（右侧滑入，可拉伸） ====== */}
      {/* 遮罩层 */}
      <div
        className={`overlay-mask ${showSidePanel ? 'visible' : ''}`}
        onClick={() => setShowSidePanel(false)}
      />

      <aside
        className={`side-panel ${showSidePanel ? 'open' : ''}`}
        style={{ width: showSidePanel ? panelWidth : undefined }}
      >
        {/* 顶部标题栏 */}
        <div className="side-panel-header">
          <h2 className="side-panel-title">对话记录</h2>
          <button
            className="side-panel-close"
            type="button"
            onClick={() => setShowSidePanel(false)}
            aria-label="关闭面板"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 消息列表区域 */}
        <div className="side-panel-body">
          {messages.length === 0 && (
            <p className="empty-hint">暂无对话记录</p>
          )}

          {messages.map((msg) => (
            <article key={msg.id} className={`message-card ${msg.role === 'user' ? 'user-msg' : ''}`}>
              <span className="card-label">{msg.role === 'user' ? '你' : 'AI'}</span>
              <p>{msg.content || (msg.role === 'assistant' ? '正在输入…' : '')}</p>
            </article>
          ))}

          {/* 错误信息 */}
          {errorMessage && <p className="error-message">{errorMessage}</p>}

          {/* 音色设置区域 */}
          <div className="settings-section">
            <button
              className="settings-toggle"
              type="button"
              onClick={() => setVoiceSettingsOpen((v) => !v)}
            >
              音色设置
            </button>

            {voiceSettingsOpen && (
              <div className="settings-panel">
                {/* GPT-SoVITS 开关 */}
                <div className="setting-row">
                  <label className="switch-label">
                    <input
                      type="checkbox"
                      checked={useGptSoVits}
                      onChange={(e) => setUseGptSoVits(e.target.checked)}
                      disabled={!gptSoVitsAvailable}
                    />
                    <span>使用 GPT-SoVITS 高级音色</span>
                    {!gptSoVitsAvailable && (
                      <span className="setting-hint">（服务未启动）</span>
                    )}
                  </label>
                </div>

                {useGptSoVits && gptSoVitsAvailable ? (
                  <>
                    <div className="setting-row">
                      <label htmlFor="ref-audio">参考音频路径</label>
                      <input
                        id="ref-audio"
                        type="text"
                        value={gptSoVitsRefAudio}
                        onChange={(e) => setGptSoVitsRefAudio(e.target.value)}
                        placeholder="C:\\path\\to\\reference.wav"
                      />
                    </div>
                    <div className="setting-row">
                      <label htmlFor="prompt-text">参考音频文本</label>
                      <input
                        id="prompt-text"
                        type="text"
                        value={gptSoVitsPromptText}
                        onChange={(e) => setGptSoVitsPromptText(e.target.value)}
                        placeholder="参考音频对应的文字内容"
                      />
                    </div>
                    <div className="setting-row">
                      <label htmlFor="sovits-speed">语速 {gptSoVitsSpeed.toFixed(1)}x</label>
                      <input
                        id="sovits-speed"
                        type="range"
                        min="0.5" max="2.0" step="0.1"
                        value={gptSoVitsSpeed}
                        onChange={(e) => setGptSoVitsSpeed(Number(e.target.value))}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="setting-row">
                      <label htmlFor="voice-select">语音</label>
                      <select
                        id="voice-select"
                        value={voiceId}
                        onChange={(e) => setVoiceId(e.target.value)}
                      >
                        <option value="">默认</option>
                        {availableVoices.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="setting-row">
                      <label htmlFor="rate-slider">
                        语速 {voiceRate > 0 ? `+${voiceRate}%` : `${voiceRate}%`}
                      </label>
                      <input
                        id="rate-slider"
                        type="range"
                        min="-30" max="50"
                        value={voiceRate}
                        onChange={(e) => setVoiceRate(Number(e.target.value))}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 左边缘拉伸手柄 */}
        <div
          className="resize-handle"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = panelWidth;

            function onMove(ev: MouseEvent) {
              const delta = startX - ev.clientX; // 向左拖 = 变宽
              const newW = Math.max(320, Math.min(700, startW + delta));
              setPanelWidth(newW);
            }

            function onUp() {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            }

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        />
      </aside>
    </>
  );
}
