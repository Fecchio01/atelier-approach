import { getCurrentUser } from '@/lib/auth';
import { approveMessage } from '@/lib/messaging/service';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { id } = await params;
  try {
    const message = await approveMessage(id, user.id);
    return Response.json({ message });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível aprovar a mensagem.' }, { status: 409 });
  }
}
