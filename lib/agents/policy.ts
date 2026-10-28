export const automationPolicy = {
  version: 'commercial-analysis-v1',
  maxRunsPerMemberPerDay: 60,
  maxPendingRunsPerMember: 10,
  maxLeadSnapshotCharacters: 1200,
  externalModelEnabled: false,
  maximumExternalCostPerRunUsd: 0,
  allowedEffects: ['CREATE_REVIEWABLE_CRM_TASK'] as const,
  forbiddenEffects: ['SEND_MESSAGE', 'CHANGE_LEAD_STAGE', 'CHANGE_SALE_VALUE', 'CHANGE_MRR'] as const
};

export function canAnalyzeLead(input: { stage: string; name: string | null; id: string }) {
  return input.stage !== 'WON' && input.stage !== 'DISCARDED' && Boolean(input.name?.trim()) && input.id.length > 0;
}
