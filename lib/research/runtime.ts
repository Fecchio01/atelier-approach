import { start } from 'workflow/api';

import { prospectingCampaign } from '@/workflows/prospecting';

export async function startProspectingCampaign(campaignId: string) {
  return start(prospectingCampaign, [campaignId]);
}
