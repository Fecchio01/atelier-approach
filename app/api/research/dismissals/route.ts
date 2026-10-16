import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

type DismissalBody = {
  osmId?: unknown;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });

  let body: DismissalBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Identificador da empresa inválido.' }, { status: 400 });
  }

  const osmId = typeof body?.osmId === 'string' ? body.osmId.trim() : '';
  const providerId = osmId.startsWith('overture/') ? osmId.slice('overture/'.length) : '';
  if (!providerId.trim() || providerId.length > 200) {
    return Response.json({ error: 'Identificador da empresa inválido.' }, { status: 400 });
  }

  await prisma.researchDismissal.upsert({
    where: { ownerId_osmId: { ownerId: user.id, osmId } },
    create: { ownerId: user.id, osmId },
    update: {}
  });

  return new Response(null, { status: 204 });
}
