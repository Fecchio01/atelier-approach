import { z } from 'zod';

import { answerAssistantChat } from '@/lib/agents/assistant-chat';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 8_192;
const requestSchema = z.object({ message: z.string().trim().min(2).max(500) }).strict();

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401, headers: noStoreHeaders });

  try {
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'A mensagem é muito longa.' }, { status: 413, headers: noStoreHeaders });
    }

    const body = await readLimitedJson(request);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Escreva uma pergunta de até 500 caracteres.' }, { status: 400, headers: noStoreHeaders });
    }

    const answer = await answerAssistantChat(parsed.data.message);
    return Response.json(answer, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: 'A mensagem é muito longa.' }, { status: 413, headers: noStoreHeaders });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: 'O conteúdo enviado não é um JSON válido.' }, { status: 400, headers: noStoreHeaders });
    }
    console.error('[agents/chat] Could not answer request', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'Não consegui consultar o CRM agora. Tente novamente em instantes.' }, { status: 503, headers: noStoreHeaders });
  }
}

async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new SyntaxError('Missing request body.');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    reader.releaseLock();
  }
}

class RequestBodyTooLargeError extends Error {}

const noStoreHeaders = { 'Cache-Control': 'private, no-store' };
