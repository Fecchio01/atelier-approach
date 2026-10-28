import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { renderProposalPdf } from '@/lib/proposals/pdf';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { id, versionId } = await params;
  const proposal = await prisma.proposalVersion.findFirst({ where: { id: versionId, proposal: { leadId: id } }, include: { proposal: true, lineItems: true } });
  if (!proposal) return Response.json({ error: 'Versão não encontrada.' }, { status: 404 });
  const pdf = await renderProposalPdf(proposal);
  return new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="proposta-${encodeURIComponent(id)}-v${proposal.version}.pdf"`, 'cache-control': 'private, no-store' } });
}
