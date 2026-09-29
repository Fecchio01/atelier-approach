import { getCurrentUser } from '../../../lib/auth';
import { closeCurrentDailyReport } from '../../../lib/daily-reports';
import { buildRecommendations, buildReport } from '../../../lib/reports';

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = parseDate(searchParams.get('from'));
  const to = parseDate(searchParams.get('to'));
  if (!from || !to || from >= to) {
    return Response.json({ error: 'Informe um período válido com datas inicial e final.' }, { status: 400 });
  }

  const report = await buildReport({ from, to });
  return Response.json({ report, recommendations: buildRecommendations(report) });
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

    const result = await closeCurrentDailyReport(user.id);
    return Response.json(result);
  } catch {
    return Response.json({ error: 'Não foi possível fechar o dia. Tente novamente.' }, { status: 500 });
  }
}
