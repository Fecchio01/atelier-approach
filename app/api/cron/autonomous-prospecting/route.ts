import { runAutonomousProspecting } from '@/lib/agents/autonomous-prospecting-cron';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  return runAutonomousProspecting(request);
}
