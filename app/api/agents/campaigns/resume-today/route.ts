import { getCurrentUser } from '@/lib/auth';
import { resumeIncompleteDailyCampaign } from '@/lib/agents/resume-incomplete-daily-campaign';

export const runtime = 'nodejs';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  try {
    return Response.json(await resumeIncompleteDailyCampaign(), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[agents/campaigns] Could not resume incomplete daily campaign', error);
    return Response.json({ error: 'Não foi possível retomar a pesquisa diária agora.' }, { status: 503 });
  }
}
