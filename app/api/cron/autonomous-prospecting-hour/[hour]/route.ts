import { runAutonomousProspecting } from '@/lib/agents/autonomous-prospecting-cron';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ hour: string }> }) {
  const { hour } = await params;
  if (!/^(?:[01]\d|2[0-3])$/.test(hour)) return Response.json({ error: 'Horário de execução inválido.' }, { status: 400 });
  return runAutonomousProspecting(request, Number(hour));
}
