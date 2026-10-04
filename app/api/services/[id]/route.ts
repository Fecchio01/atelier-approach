import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseServiceData } from '@/lib/service-sales';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const data = parseServiceData(await request.json().catch(() => null), true);
  if (!data) return Response.json({ error: 'Dados do serviço inválidos.' }, { status: 400 });
  const { id } = await params;
  try {
    const service = await prisma.serviceCatalogItem.update({ where: { id }, data });
    return Response.json({ service });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return Response.json({ error: 'Serviço não encontrado.' }, { status: 404 });
    }
    throw error;
  }
}
