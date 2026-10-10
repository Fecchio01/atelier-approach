import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { isCronAuthExemptPath } from '../../lib/middleware-paths';

const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock('../../lib/db', () => ({ prisma: {} }));
vi.mock('../../lib/process-lead-lifecycle', () => ({ processLeadLifecycle: mocks.process }));

import { GET } from '../../app/api/cron/crm-lifecycle/route';

describe('CRM lifecycle cron route without database', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-test-secret');
    mocks.process.mockResolvedValue({ movedToFollowUp: 2, discardedForInactivity: 1, permanentlyDeleted: 3 });
  });
  afterEach(() => vi.unstubAllEnvs());

  test('middleware exemption is limited to the exact lifecycle cron path', () => {
    expect(isCronAuthExemptPath('/api/cron/crm-lifecycle')).toBe(true);
    expect(isCronAuthExemptPath('/api/cron/crm-lifecycle/')).toBe(false);
    expect(isCronAuthExemptPath('/api/cron/crm-lifecycle/other')).toBe(false);
    expect(isCronAuthExemptPath('/api/cron/other')).toBe(false);
  });

  test('rejects requests when the cron secret is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await GET(new Request('http://localhost/api/cron/crm-lifecycle'));
    expect(response.status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  test('rejects missing and incorrect bearer credentials', async () => {
    const missing = await GET(new Request('http://localhost/api/cron/crm-lifecycle'));
    const wrong = await GET(new Request('http://localhost/api/cron/crm-lifecycle', { headers: { authorization: 'Bearer wrong' } }));
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  test('runs with server time and returns counts without lead data', async () => {
    const response = await GET(new Request('http://localhost/api/cron/crm-lifecycle', { headers: { authorization: 'Bearer cron-test-secret' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ movedToFollowUp: 2, discardedForInactivity: 1, permanentlyDeleted: 3 });
    expect(mocks.process).toHaveBeenCalledWith({}, expect.any(Date));
  });
});
