import { describe, expect, it, vi } from 'vitest';

import { getCrmBoardVersion } from '../../lib/crm-board-version';

describe('CRM board version', () => {
  it('changes when leads or stage-history entries change', async () => {
    const leadAggregate = vi.fn().mockResolvedValue({ _count: { _all: 7 } });
    const historyAggregate = vi.fn().mockResolvedValue({ _count: { _all: 12 }, _max: { createdAt: new Date('2026-10-17T12:00:00.123Z') } });
    const activityAggregate = vi.fn().mockResolvedValue({ _count: { _all: 4 }, _max: { createdAt: new Date('2026-10-18T12:00:00.123Z') } });
    const database = { lead: { aggregate: leadAggregate }, stageHistory: { aggregate: historyAggregate }, activity: { aggregate: activityAggregate } } as never;

    await expect(getCrmBoardVersion(database)).resolves.toBe('7:12:2026-10-17T12:00:00.123Z:4:2026-10-18T12:00:00.123Z');
    expect(leadAggregate).toHaveBeenCalledWith({ _count: { _all: true } });
    expect(historyAggregate).toHaveBeenCalledWith({ _count: { _all: true }, _max: { createdAt: true } });
    expect(activityAggregate).toHaveBeenCalledWith({ _count: { _all: true }, _max: { createdAt: true } });
  });
});
