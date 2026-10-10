import { afterEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock('../../lib/db', () => ({ prisma: {} }));
vi.mock('../../lib/process-lead-lifecycle', () => ({ processLeadLifecycle: mocks.process }));

import { processCrmLifecycleForPageRequest } from '../../lib/crm-lifecycle-page-request';

describe('CRM lifecycle processing on page requests', () => {
  afterEach(() => vi.resetAllMocks());

  test('runs the existing lifecycle rules with the request time and database', async () => {
    const database = { lead: {} };
    const now = new Date('2026-10-10T12:00:00.000Z');
    mocks.process.mockResolvedValue({ movedToFollowUp: 1, discardedForInactivity: 0, permanentlyDeleted: 0 });

    await expect(processCrmLifecycleForPageRequest(database as never, now)).resolves.toEqual({
      movedToFollowUp: 1,
      discardedForInactivity: 0,
      permanentlyDeleted: 0
    });
    expect(mocks.process).toHaveBeenCalledWith(database, now);
  });
});
