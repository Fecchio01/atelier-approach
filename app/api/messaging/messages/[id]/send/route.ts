import { getCurrentUser } from '@/lib/auth';
import { sendApprovedMessage } from '@/lib/messaging/service';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { id } = await params;
  try {
    const result = await sendApprovedMessage({ messageId: id });
    return Response.json(result, { status: result.status === 'BLOCKED' ? 503 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível iniciar o envio.' }, { status: 409 });
  }
}
