import { NextRequest } from 'next/server';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

function buildOllamaEndpoint() {
  return process.env.OLLAMA_CHAT_URL ?? 'http://127.0.0.1:11434/api/chat';
}

function buildModelName() {
  return process.env.OLLAMA_MODEL ?? 'qwen3.5-4b-clean';
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { messages?: ChatMessage[] };
  const messages = payload.messages ?? [];

  const upstreamResponse = await fetch(buildOllamaEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: buildModelName(),
      messages,
      stream: true,
      think: false,  // 关闭 Qwen3.5 的思考模式，避免生成大量思考 token 导致延迟
      options: {
        temperature: 0.6,
        num_ctx: 8192,
      },
    }),
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const detail = await upstreamResponse.text();
    return new Response(detail || 'Ollama service unavailable', {
      status: upstreamResponse.status || 502,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstreamResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
              continue;
            }

            const parsed = JSON.parse(trimmedLine) as {
              message?: { content?: string };
              done?: boolean;
            };
            const delta = parsed.message?.content ?? '';

            if (delta) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
              );
            }

            if (parsed.done) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            }
          }
        }

        if (buffer.trim()) {
          const parsed = JSON.parse(buffer.trim()) as {
            message?: { content?: string };
            done?: boolean;
          };
          if (parsed.message?.content) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta: parsed.message.content })}\n\n`),
            );
          }
          if (parsed.done) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
