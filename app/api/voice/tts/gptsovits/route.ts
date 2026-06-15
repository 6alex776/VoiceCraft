import { NextRequest } from 'next/server';

function buildVoiceServiceBase() {
  return process.env.VOICE_SERVICE_URL ?? 'http://127.0.0.1:8001';
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    text?: string;
    ref_wav_path?: string;
    prompt_text?: string;
    speed?: number;
  };

  if (!payload.text?.trim()) {
    return new Response('Missing text', { status: 400 });
  }

  const response = await fetch(`${buildVoiceServiceBase()}/tts/gptsovits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'audio/wav',
    },
  });
}
