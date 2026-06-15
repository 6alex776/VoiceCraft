import { NextRequest } from 'next/server';

function buildVoiceServiceBase() {
  return process.env.VOICE_SERVICE_URL ?? 'http://127.0.0.1:8001';
}

export async function GET(_request: NextRequest) {
  const response = await fetch(`${buildVoiceServiceBase()}/tts/gptsovits/status`, {
    method: 'GET',
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}
