import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { createHumanCrmActor } from '@/lib/crm/actor';
import { executeCrmCommand } from '@/lib/crm/commands';
import { prisma } from '@/lib/db';
import { normalizePublishedPhone, toWhatsAppHref } from '@/lib/contact-links';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const body = z.object({ confirmIdentityReview: z.boolean().optional() }).strict()
    .safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: 'Solicitação inválida.' }, { status: 400 });
  const { id } = await params;
  const actor = createHumanCrmActor(user.id);

  try {
    const result = await executeCrmCommand(prisma, actor, async (tx) => {
      const candidate = await tx.prospectCandidate.findUnique({ where: { id } });
      if (!candidate) return { kind: 'not_found' as const };

      if (candidate.status === 'REJECTED') return { kind: 'rejected' as const };
      if (candidate.status === 'REVIEW_IDENTITY' && !body.data.confirmIdentityReview) {
        return { kind: 'identity_review_required' as const };
      }

      const linkedLead = candidate.leadId
        ? await tx.lead.findUnique({ where: { id: candidate.leadId }, select: { id: true, discardedAt: true } })
        : null;
      if (linkedLead) {
        if (linkedLead.discardedAt) return { kind: 'lead_discarded' as const, leadId: linkedLead.id };
        return { kind: 'already_in_crm' as const, leadId: linkedLead.id };
      }

      const existingLead = await tx.lead.findUnique({ where: { osmId: candidate.externalId }, select: { id: true, discardedAt: true } });
      if (existingLead) {
        if (existingLead.discardedAt) return { kind: 'lead_discarded' as const, leadId: existingLead.id };
        await tx.prospectCandidate.update({ where: { id: candidate.id }, data: { leadId: existingLead.id, status: 'PROMOTED' } });
        return { kind: 'already_in_crm' as const, leadId: existingLead.id };
      }

      const lead = await tx.lead.create({
        data: {
          osmId: candidate.externalId,
          name: candidate.name,
          phone: normalizePublishedPhone(candidate.phone),
          website: candidate.website,
          instagram: candidate.instagram,
          whatsapp: toWhatsAppHref(candidate.whatsapp),
          address: candidate.address,
          category: candidate.category,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          syncedAt: new Date(),
          stage: 'NEW'
        },
        select: { id: true }
      });
      await tx.prospectCandidate.update({ where: { id: candidate.id }, data: { leadId: lead.id, status: 'PROMOTED' } });
      return { kind: 'created' as const, leadId: lead.id };
    });

    if (result.kind === 'not_found') return Response.json({ error: 'Empresa pesquisada não encontrada.' }, { status: 404 });
    if (result.kind === 'rejected') return Response.json({ error: 'Esta candidata foi descartada da pesquisa.' }, { status: 409 });
    if (result.kind === 'identity_review_required') {
      return Response.json({ error: 'Confira a identidade da empresa antes de adicioná-la.', requiresIdentityReview: true }, { status: 409 });
    }
    if (result.kind === 'lead_discarded') {
      return Response.json({ error: 'Esta empresa já está na lixeira do CRM.', leadId: result.leadId }, { status: 409 });
    }

    return Response.json({
      leadId: result.leadId,
      href: `/crm?lead=${encodeURIComponent(result.leadId)}`,
      alreadyInCrm: result.kind === 'already_in_crm'
    }, { status: result.kind === 'created' ? 201 : 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const { id } = await params;
      const candidate = await prisma.prospectCandidate.findUnique({ where: { id }, select: { externalId: true } });
      const lead = candidate ? await prisma.lead.findUnique({ where: { osmId: candidate.externalId }, select: { id: true, discardedAt: true } }) : null;
      if (lead && !lead.discardedAt) {
        await prisma.prospectCandidate.update({ where: { id }, data: { leadId: lead.id, status: 'PROMOTED' } });
        return Response.json({ leadId: lead.id, href: `/crm?lead=${encodeURIComponent(lead.id)}`, alreadyInCrm: true });
      }
    }
    throw error;
  }
}
