import { start } from 'workflow/api';

import { commercialLeadAnalysis } from '@/workflows/commercial';

export async function startCommercialLeadAnalysis(runId: string) {
  return start(commercialLeadAnalysis, [runId]);
}
