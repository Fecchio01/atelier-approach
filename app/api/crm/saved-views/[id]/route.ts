import { Prisma } from '@prisma/client';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseCrmSavedViewName } from '@/lib/crm-saved-views';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Atualização da visão inválida.' }, { status: 400 });
  }
  const name = body && typeof body === 'object' && !Array.isArray(body)
    ? parseCrmSavedViewName((body as Record<string, unknown>).name)
    : null;
  if (!name) return Response.json({ error: 'O nome deve ter entre 1 e 40 caracteres.' }, { status: 400 });

  const { id } = await params;
  try {
    const result = await prisma.crmSavedView.updateMany({
      where: { id, ownerId: user.id },
      data: { name: name.name, normalizedName: name.normalizedName }
    });
    if (result.count !== 1) return Response.json({ error: 'Visão salva não encontrada.' }, { status: 404 });
    const record = await prisma.crmSavedView.findFirst({ where: { id, ownerId: user.id } });
    return Response.json({ view: record ? { id: record.id, name: record.name, updatedAt: record.updatedAt.toISOString() } : null });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json({ error: 'Já existe uma visão com esse nome nesta área.' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { id } = await params;
  const result = await prisma.crmSavedView.deleteMany({ where: { id, ownerId: user.id } });
  if (result.count !== 1) return Response.json({ error: 'Visão salva não encontrada.' }, { status: 404 });
  return Response.json({ deleted: true });
}
