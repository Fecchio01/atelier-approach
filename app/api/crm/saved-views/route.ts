import { CrmSavedViewScope, Prisma } from '@prisma/client';

import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isCrmSavedViewScope, parseCrmSavedViewFilters, parseCrmSavedViewName } from '@/lib/crm-saved-views';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const scope = new URL(request.url).searchParams.get('scope');
  if (!isCrmSavedViewScope(scope)) return Response.json({ error: 'Área do CRM inválida.' }, { status: 400 });

  const records = await prisma.crmSavedView.findMany({
    where: { ownerId: user.id, scope },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
  });
  const views = records.flatMap((record) => {
    const filters = parseCrmSavedViewFilters(record.scope, record.filters);
    return filters ? [{
      id: record.id,
      scope: record.scope,
      name: record.name,
      filters,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    }] : [];
  });

  return Response.json({ views }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Dados da visão inválidos.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Dados da visão inválidos.' }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (!isCrmSavedViewScope(input.scope)) return Response.json({ error: 'Área do CRM inválida.' }, { status: 400 });
  const name = parseCrmSavedViewName(input.name);
  const filters = parseCrmSavedViewFilters(input.scope, input.filters);
  if (!name) return Response.json({ error: 'O nome deve ter entre 1 e 40 caracteres.' }, { status: 400 });
  if (!filters) return Response.json({ error: 'Os filtros desta visão são inválidos.' }, { status: 400 });

  const existingCount = await prisma.crmSavedView.count({ where: { ownerId: user.id, scope: input.scope } });
  if (existingCount >= 20) return Response.json({ error: 'Você já tem 20 visões nesta área. Apague uma para salvar outra.' }, { status: 409 });

  try {
    const record = await prisma.crmSavedView.create({
      data: {
        ownerId: user.id,
        scope: input.scope,
        name: name.name,
        normalizedName: name.normalizedName,
        filters: filters as Prisma.InputJsonValue
      }
    });
    return Response.json({ view: {
      id: record.id,
      scope: record.scope,
      name: record.name,
      filters,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    } }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return Response.json({ error: 'Já existe uma visão com esse nome nesta área.' }, { status: 409 });
    }
    throw error;
  }
}
