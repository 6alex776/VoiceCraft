import { NextRequest } from 'next/server';

function buildVoiceServiceBase() {
  return process.env.VOICE_SERVICE_URL ?? 'http://127.0.0.1:8001';
}

export async function POST(request: NextRequest) {
  const payload = await request.json();

  if (!payload.text?.trim()) {
    return new Response('Missing text', { status: 400 });
  }

  const response = await fetch(`${buildVoiceServiceBase()}/tts/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return new Response(await response.text(), { status: response.status });
  }

  // 直接透传二进制流
  return new Response(response.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Stream-Format': 'binary-frames',
    },
  });
}
