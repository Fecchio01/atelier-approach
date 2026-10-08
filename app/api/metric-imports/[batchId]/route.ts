import { getCurrentUser } from '@/lib/auth';
import { deleteMetricImport } from '@/lib/metric-imports';

export async function DELETE(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  if (!await getCurrentUser()) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const { batchId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(batchId)) return Response.json({ error: 'Importação inválida.' }, { status: 400 });
  const deleted = await deleteMetricImport(batchId);
  if (!deleted) return Response.json({ error: 'Importação não encontrada.' }, { status: 404 });
  return Response.json({ deleted: true });
}
