import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

const dispositionSchema = z.object({ action: z.enum(['discard', 'restore']) }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const body = dispositionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Solicitação inválida.' }, { status: 400 });

  const { id } = await params;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "atelier"."ProspectCandidate" WHERE "id" = ${id} FOR UPDATE`;
    const candidate = await tx.prospectCandidate.findUnique({
      where: { id },
      select: {
        id: true,
        externalId: true,
        status: true,
        leadId: true,
        discardedAt: true,
        campaigns: { select: { campaign: { select: { ownerId: true, idempotencyKey: true } } } }
      }
    });
    if (!candidate || !candidate.campaigns.some(({ campaign }) => campaign.ownerId === 'team' && campaign.idempotencyKey.startsWith('autonomous:'))) {
      return { kind: 'not_found' as const };
    }
    if (candidate.leadId) return { kind: 'already_linked' as const };
    const lead = await tx.lead.findUnique({ where: { osmId: candidate.externalId }, select: { id: true } });
    if (lead) return { kind: 'already_linked' as const };

    if (body.data.action === 'discard') {
      if (candidate.discardedAt) return { kind: 'updated' as const, discardedAt: candidate.discardedAt };
      if (candidate.status === 'REJECTED') return { kind: 'legacy_rejected' as const };
      const discardedAt = new Date();
      const update = await tx.prospectCandidate.updateMany({ where: { id, leadId: null, discardedAt: null }, data: { discardedAt } });
      return update.count ? { kind: 'updated' as const, discardedAt } : { kind: 'conflict' as const };
    }

    if (!candidate.discardedAt) return { kind: 'updated' as const, discardedAt: null };
    const update = await tx.prospectCandidate.updateMany({ where: { id, leadId: null, discardedAt: { not: null } }, data: { discardedAt: null } });
    return update.count ? { kind: 'updated' as const, discardedAt: null } : { kind: 'conflict' as const };
  });

  if (result.kind === 'not_found') return Response.json({ error: 'Empresa pesquisada não encontrada.' }, { status: 404 });
  if (result.kind === 'already_linked') return Response.json({ error: 'Esta empresa já foi registrada no CRM. Abra o funil para conferir o cadastro existente.' }, { status: 409 });
  if (result.kind === 'legacy_rejected') return Response.json({ error: 'Esta empresa já foi recusada na análise e não pode ser restaurada por aqui.' }, { status: 409 });
  if (result.kind === 'conflict') return Response.json({ error: 'A empresa mudou de estado. Atualize a pesquisa e tente de novo.' }, { status: 409 });
  return Response.json({ discardedAt: result.discardedAt?.toISOString() ?? null });
}
