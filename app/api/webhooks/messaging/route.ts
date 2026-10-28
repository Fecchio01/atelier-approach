import { processProviderEvent, providerEventSchema, verifyProviderSignature } from '@/lib/messaging/webhooks';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const provider = process.env.MESSAGING_PROVIDER_NAME?.trim();
  const secret = process.env.MESSAGING_WEBHOOK_SECRET;
  if (!provider || !secret) return Response.json({ error: 'Webhook de mensagens não configurado.' }, { status: 503 });
  const rawBody = await request.text();
  if (rawBody.length > 24_000) return Response.json({ error: 'Payload muito grande.' }, { status: 413 });
  const signature = request.headers.get('x-provider-signature') ?? '';
  if (!verifyProviderSignature(rawBody, signature, secret)) return Response.json({ error: 'Assinatura inválida.' }, { status: 401 });
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return Response.json({ error: 'JSON inválido.' }, { status: 400 }); }
  const event = providerEventSchema.safeParse(body);
  if (!event.success) return Response.json({ error: 'Evento de provedor inválido.' }, { status: 400 });
  try {
    const result = await processProviderEvent(provider, event.data);
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error('Falha ao processar evento de mensagens', { provider, eventId: event.data.eventId, error });
    return Response.json({ error: 'Evento recebido; processamento precisa ser reconciliado.' }, { status: 503 });
  }
}
