'use client';

import { useEffect, useState } from 'react';

type AsrInfo = {
  model_loaded: boolean;
  model_name: string | null;
  compute_type: string | null;
  device: string | null;
  local_files_only: boolean | null;
  error: string | null;
};

type HealthData = {
  status: string;
  asr: AsrInfo;
};

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';

export function DebugPanel({
  voiceState,
  visible,
  onToggle,
}: {
  voiceState: VoiceState;
  visible: boolean;
  onToggle: () => void;
}) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    async function fetchHealth() {
      try {
        const res = await fetch('/api/voice/health');
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as HealthData;
        if (!cancelled) {
          setHealth(data);
          setFetchError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : '请求失败');
        }
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [visible]);

  return (
    <div className="debug-panel-wrap">
      <button className="debug-toggle" type="button" onClick={onToggle} aria-label="调试面板">
        <span className="debug-toggle-icon" />
      </button>

      {visible ? (
        <div className="debug-panel">
          <h4>调试面板</h4>

          <div className="debug-section">
            <h5>语音状态机</h5>
            <div className="debug-state-machine">
              {(['idle', 'listening', 'thinking', 'speaking', 'interrupted'] as VoiceState[]).map(
                (state) => (
                  <div
                    key={state}
                    className={`debug-state ${state === voiceState ? 'active' : ''}`}
                  >
                    {stateLabel(state)}
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="debug-section">
            <h5>ASR 信息</h5>
            {fetchError ? (
              <p className="debug-error">获取失败: {fetchError}</p>
            ) : health ? (
              <dl className="debug-dl">
                <dt>模型加载</dt>
                <dd>{health.asr.model_loaded ? '是' : '否'}</dd>

                <dt>模型名称</dt>
                <dd>{health.asr.model_name ?? '—'}</dd>

                <dt>计算类型</dt>
                <dd>{health.asr.compute_type ?? '—'}</dd>

                <dt>设备</dt>
                <dd>{health.asr.device ?? '—'}</dd>

                <dt>仅本地文件</dt>
                <dd>{health.asr.local_files_only === null ? '—' : health.asr.local_files_only ? '是' : '否'}</dd>

                {health.asr.error ? (
                  <>
                    <dt className="debug-error-dt">错误</dt>
                    <dd className="debug-error">{health.asr.error}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p>加载中...</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function stateLabel(state: VoiceState): string {
  const labels: Record<VoiceState, string> = {
    idle: '空闲',
    listening: '聆听中',
    thinking: '思考中',
    speaking: '回应中',
    interrupted: '已打断',
  };
  return labels[state];
}
