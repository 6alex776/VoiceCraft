import { NextRequest } from 'next/server';

function buildVoiceServiceBase() {
  return process.env.VOICE_SERVICE_URL ?? 'http://127.0.0.1:8001';
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return new Response('Missing audio file', { status: 400 });
  }

  const upstreamForm = new FormData();
  upstreamForm.append('file', file, file.name || 'recording.webm');

  const response = await fetch(`${buildVoiceServiceBase()}/transcribe`, {
    method: 'POST',
    body: upstreamForm,
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
    },
  });
}
