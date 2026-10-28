import { createHash } from 'node:crypto';
import { ProposalVersionStatus } from '@prisma/client';

import { prisma } from '@/lib/db';
import { priceInCents } from '@/lib/service-sales';

export async function createProposalVersion(input: { leadId: string; serviceIds: string[]; notes?: string | null; validUntil?: Date | null }, actorId: string) {
  const serviceIds = [...new Set(input.serviceIds)];
  if (serviceIds.length === 0 || serviceIds.length > 20) throw new Error('Selecione de 1 a 20 serviços ativos do catálogo.');
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId }, select: { id: true, name: true, version: true, stage: true } });
  if (!lead || !lead.name?.trim() || lead.stage === 'WON' || lead.stage === 'DISCARDED') throw new Error('Empresa indisponível para proposta.');
  const customerName = lead.name.trim();
  const services = await prisma.serviceCatalogItem.findMany({ where: { id: { in: serviceIds }, isActive: true }, orderBy: { name: 'asc' } });
  if (services.length !== serviceIds.length) throw new Error('Um ou mais serviços foram arquivados ou não existem. Atualize e tente novamente.');
  let saleCents = 0;
  let mrrCents = 0;
  const lineItems = services.map((service) => {
    const priceCents = priceInCents(service.price.toFixed(2));
    saleCents += priceCents;
    if (service.billingType === 'MONTHLY') mrrCents += priceCents;
    const description = [service.scope, service.deliverables, service.restrictions ? `Restrições: ${service.restrictions}` : null].filter(Boolean).join('\n').slice(0, 3000) || 'Descrição não cadastrada.';
    return { serviceId: service.id, serviceName: service.name, description, price: (priceCents / 100).toFixed(2), billingType: service.billingType, quantity: 1 };
  });
  if (!Number.isSafeInteger(saleCents) || !Number.isSafeInteger(mrrCents)) throw new Error('Totais inválidos.');
  const snapshot = { leadId: lead.id, leadVersion: lead.version, customerName, notes: input.notes?.trim() || null, validUntil: input.validUntil?.toISOString() ?? null, lineItems };
  const contentHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

  return prisma.$transaction(async (tx) => {
    const current = await tx.lead.findUnique({ where: { id: lead.id }, select: { version: true, stage: true } });
    if (!current || current.version !== lead.version || current.stage === 'WON' || current.stage === 'DISCARDED') throw new Error('A empresa mudou enquanto a proposta era montada. Revise e tente novamente.');
    const existing = await tx.proposal.findFirst({ where: { leadId: lead.id }, orderBy: { currentVersion: 'desc' } });
    const proposal = existing
      ? await tx.proposal.update({ where: { id: existing.id }, data: { currentVersion: { increment: 1 } } })
      : await tx.proposal.create({ data: { leadId: lead.id, createdById: actorId, currentVersion: 1 } });
    const version = existing ? proposal.currentVersion : 1;
    return tx.proposalVersion.create({
      data: {
        proposalId: proposal.id, version, status: ProposalVersionStatus.DRAFT, leadVersion: lead.version,
        customerName, notes: input.notes?.trim() || null, validUntil: input.validUntil ?? null,
        saleValue: (saleCents / 100).toFixed(2), mrr: (mrrCents / 100).toFixed(2), contentHash,
        createdById: actorId,
        lineItems: { create: lineItems }
      }, include: { lineItems: true }
    });
  });
}

export async function approveProposalVersion(leadId: string, versionId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const version = await tx.proposalVersion.findFirst({ where: { id: versionId, proposal: { leadId } }, include: { proposal: { include: { lead: true } } } });
    if (!version || version.status !== ProposalVersionStatus.DRAFT) throw new Error('Versão não disponível para aprovação.');
    if (version.proposal.lead.version !== version.leadVersion || version.proposal.lead.stage === 'WON' || version.proposal.lead.stage === 'DISCARDED') throw new Error('A empresa mudou; crie uma nova versão antes de aprovar.');
    return tx.proposalVersion.update({ where: { id: version.id }, data: { status: ProposalVersionStatus.APPROVED, approvedById: actorId, approvedAt: new Date() }, include: { lineItems: true } });
  });
}
