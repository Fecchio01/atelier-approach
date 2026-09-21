import { describe, expect, test } from 'vitest';

import { auxiliaryFunnelStages, isApproachStage, mainFunnelStages, stageLabels } from '../../lib/funnel';

describe('funnel', () => {
  test('orders the seven operational funnel stages', () => {
    expect(mainFunnelStages).toEqual(['NEW', 'CONTACTED', 'IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'FOLLOW_UP', 'WON']);
    expect(auxiliaryFunnelStages).toEqual(['NO_RESPONSE', 'DISCARDED']);
    expect(stageLabels.PROPOSAL).toBe('Proposta enviada');
  });

  test('recognizes approached stages while keeping legacy interest data labeled', () => {
    expect(isApproachStage('CONTACTED')).toBe(true);
    expect(isApproachStage('NEW')).toBe(false);
    expect(stageLabels.INTEREST).toBe('Em conversa');
  });
});
