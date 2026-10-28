import { z } from 'zod';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createProposalVersion } from '@/lib/proposals/service';

const schema = z.object({ serviceIds: z.array(z.string().min(1).max(128)).min(1).max(20), notes: z.string().max(3000).optional().nullable(), validUntil: z.string().datetime().optional().nullable() }).strict();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { id } = await params;
  const versions = await prisma.proposalVersion.findMany({ where: { proposal: { leadId: id } }, include: { lineItems: true }, orderBy: [{ proposal: { currentVersion: 'desc' } }, { version: 'desc' }] });
  return Response.json({ versions });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Selecione serviços válidos do catálogo.' }, { status: 400 });
  try {
    const version = await createProposalVersion({
      leadId: id, serviceIds: parsed.data.serviceIds, notes: parsed.data.notes,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null
    }, user.id);
    return Response.json({ version }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Não foi possível criar a proposta.' }, { status: 409 });
  }
}
