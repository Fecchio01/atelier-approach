export const mainFunnelStages = ['CONTACTED', 'IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'MEETING', 'FOLLOW_UP', 'WON'] as const;

export const auxiliaryFunnelStages = ['NO_RESPONSE', 'DISCARDED'] as const;

export const stageLabels = {
  NEW: 'Abordado',
  CONTACTED: 'Abordado',
  IN_CONVERSATION: 'Em conversa',
  QUALIFIED: 'Qualificado',
  PROPOSAL: 'Proposta enviada',
  MEETING: 'Reunião',
  FOLLOW_UP: 'Follow-up',
  WON: 'Ganho',
  NO_RESPONSE: 'Sem resposta',
  DISCARDED: 'Descartado',
  // Dados anteriores à expansão usavam INTEREST. Eles continuam válidos,
  // mas compartilham a coluna “Em conversa”, sem criar uma oitava coluna.
  INTEREST: 'Em conversa'
} as const;

export type MainFunnelStage = (typeof mainFunnelStages)[number];
export type AuxiliaryFunnelStage = (typeof auxiliaryFunnelStages)[number];
export type FunnelStage = MainFunnelStage | AuxiliaryFunnelStage;
export type PersistedFunnelStage = FunnelStage | 'NEW' | 'INTEREST';

export function normalizeFunnelStage(stage: PersistedFunnelStage | string): FunnelStage {
  if (stage === 'NEW') return 'CONTACTED';
  if (stage === 'INTEREST') return 'IN_CONVERSATION';
  if ((mainFunnelStages as readonly string[]).includes(stage)) return stage as MainFunnelStage;
  if ((auxiliaryFunnelStages as readonly string[]).includes(stage)) return stage as AuxiliaryFunnelStage;
  return 'CONTACTED';
}

export function isApproachStage(stage: PersistedFunnelStage | string) {
  return normalizeFunnelStage(stage) === 'CONTACTED';
}

export function isInterestStage(stage: PersistedFunnelStage | string) {
  return normalizeFunnelStage(stage) === 'IN_CONVERSATION';
}

export function isMeetingStage(stage: PersistedFunnelStage | string) {
  return normalizeFunnelStage(stage) === 'MEETING';
}
