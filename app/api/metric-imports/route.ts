import { getCurrentUser } from '@/lib/auth';
import { createMetricImport, listMetricImports, MetricImportConflictError } from '@/lib/metric-imports';

export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  return Response.json({ imports: await listMetricImports() });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'Revise os dados da importação.' }, { status: 400 });

  const data = body as Record<string, unknown>;
  try {
    const result = await createMetricImport({
      fileName: data.fileName as string,
      periodStart: new Date(data.periodStart as string),
      periodEnd: new Date(data.periodEnd as string),
      rows: data.rows as Parameters<typeof createMetricImport>[0]['rows'],
      actorId: user.id,
      confirmAdditional: data.confirmAdditional === true
    });
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof MetricImportConflictError) return Response.json({ error: error.message, code: 'ADDITIONAL_CONFIRMATION_REQUIRED' }, { status: 409 });
    if (error instanceof TypeError || error instanceof RangeError) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ error: 'Não foi possível salvar os resultados agora.' }, { status: 500 });
  }
}
