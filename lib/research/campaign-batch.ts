export function isCampaignBatchReady(campaign: {
  status: string;
  error?: string | null;
  candidateCount: number;
  maxCandidates: number;
}) {
  return campaign.status === 'COMPLETED'
    && !campaign.error
    && campaign.candidateCount >= campaign.maxCandidates;
}
