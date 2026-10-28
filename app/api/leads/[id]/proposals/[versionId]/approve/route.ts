import { getCurrentUser } from '@/lib/auth';
import { approveProposalVersion } from '@/lib/proposals/service';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { id, versionId } = await params;
  try {
    const version = await approveProposalVersion(id, versionId, user.id);
    return Response.json({ version });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível aprovar esta versão.' }, { status: 409 });
  }
}
