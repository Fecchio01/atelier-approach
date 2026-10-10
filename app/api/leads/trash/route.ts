import { getCurrentUser } from '../../../../lib/auth';
import { prisma } from '../../../../lib/db';

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const result = await prisma.lead.deleteMany({ where: { stage: 'DISCARDED' } });
  return Response.json({ deletedCount: result.count });
}
