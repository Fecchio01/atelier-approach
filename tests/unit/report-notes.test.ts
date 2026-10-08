import { describe, expect, it } from 'vitest';

import { formatReportNote } from '../../lib/report-notes';

describe('report note labels', () => {
  it('translates persisted funnel stage codes into the existing Portuguese stage labels', () => {
    expect(formatReportNote('Etapa alterada para IN_CONVERSATION.')).toBe('Etapa alterada para Em conversa.');
    expect(formatReportNote('Etapa alterada para INTEREST.')).toBe('Etapa alterada para Em conversa.');
    expect(formatReportNote('Etapa alterada para FOLLOW_UP.')).toBe('Etapa alterada para Follow-up.');
  });

  it('preserves ordinary notes and makes unknown stage keys readable', () => {
    expect(formatReportNote('Aguardando retorno.')).toBe('Aguardando retorno.');
    expect(formatReportNote('Etapa alterada para LEGACY_STAGE.')).toBe('Etapa alterada para legacy stage.');
  });
});
