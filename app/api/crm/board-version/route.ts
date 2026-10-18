import { getCurrentUser } from '../../../../lib/auth';
import { getCrmBoardVersion } from '../../../../lib/crm-board-version';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const version = await getCrmBoardVersion();
  return Response.json({ version }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
