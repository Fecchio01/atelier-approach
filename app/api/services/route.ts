import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseServiceData } from '@/lib/service-sales';

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const services = await prisma.serviceCatalogItem.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  return Response.json({ services });
}

export async function POST(request: Request) {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const data = parseServiceData(await request.json().catch(() => null));
  if (!data?.name || data.price === undefined || !data.billingType) {
    return Response.json({ error: 'Informe nome, preço não negativo com até duas casas decimais e tipo de cobrança válido.' }, { status: 400 });
  }
  const service = await prisma.serviceCatalogItem.create({ data: { ...data, name: data.name, price: data.price, billingType: data.billingType } });
  return Response.json({ service }, { status: 201 });
}
