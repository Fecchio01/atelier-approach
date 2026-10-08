import { describe, expect, test } from 'vitest';

import { auxiliaryFunnelStages, isApproachStage, isInterestStage, isMeetingStage, mainFunnelStages, normalizeFunnelStage, stageLabels } from '../../lib/funnel';

describe('funnel', () => {
  test('orders the seven operational funnel stages', () => {
    expect(mainFunnelStages).toEqual(['CONTACTED', 'IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'MEETING', 'FOLLOW_UP', 'WON']);
    expect(auxiliaryFunnelStages).toEqual(['NO_RESPONSE', 'DISCARDED']);
    expect(stageLabels.PROPOSAL).toBe('Proposta enviada');
  });

  test('recognizes approached stages while keeping legacy interest data labeled', () => {
    expect(isApproachStage('CONTACTED')).toBe(true);
    expect(isApproachStage('NEW')).toBe(true);
    expect(stageLabels.INTEREST).toBe('Em conversa');
  });

  test('counts interest only when a lead becomes qualified, not while it is in conversation', () => {
    expect(isInterestStage('QUALIFIED')).toBe(true);
    expect(isInterestStage('IN_CONVERSATION')).toBe(false);
    expect(isInterestStage('INTEREST')).toBe(false);
    expect(isInterestStage('PROPOSAL')).toBe(false);
  });

  test('normalizes legacy and unknown stages into operational columns', () => {
    expect(normalizeFunnelStage('NEW')).toBe('CONTACTED');
    expect(normalizeFunnelStage('INTEREST')).toBe('IN_CONVERSATION');
    expect(normalizeFunnelStage('UNKNOWN')).toBe('CONTACTED');
    expect(normalizeFunnelStage('')).toBe('CONTACTED');
    const persisted = ['NEW', 'CONTACTED', 'INTEREST', 'IN_CONVERSATION'];
    expect(persisted.filter((stage) => normalizeFunnelStage(stage) === 'CONTACTED')).toHaveLength(2);
    expect(persisted.filter((stage) => normalizeFunnelStage(stage) === 'IN_CONVERSATION')).toHaveLength(2);
  });

  test.each(['MEETING', 'FOLLOW_UP', 'NEW', 'INTEREST', 'UNKNOWN'])('classifies only MEETING as a meeting (%s)', (stage) => {
    expect(isMeetingStage(stage)).toBe(stage === 'MEETING');
  });
});
