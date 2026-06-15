import { NextRequest } from 'next/server';

function buildVoiceServiceBase() {
  return process.env.VOICE_SERVICE_URL ?? 'http://127.0.0.1:8001';
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { text?: string; voice_id?: string; rate?: number; volume?: number };
  const text = payload.text?.trim();

  if (!text) {
    return new Response('Missing text', { status: 400 });
  }

  const response = await fetch(`${buildVoiceServiceBase()}/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: payload.voice_id,
      rate: payload.rate,
      volume: payload.volume,
    }),
  });

  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'audio/wav',
    },
  });
}
