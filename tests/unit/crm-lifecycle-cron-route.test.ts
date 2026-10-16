import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  processCrmLifecycleForPageRequest: vi.fn()
}));

vi.mock('../../lib/crm-lifecycle-page-request', () => ({
  processCrmLifecycleForPageRequest: mocks.processCrmLifecycleForPageRequest
}));

import { GET } from '../../app/api/cron/crm-lifecycle/route';

const SECRET = 'cron-secret-value';
const counts = { movedToFollowUp: 3, discardedForInactivity: 2, permanentlyDeleted: 1 };

function request(authorization?: string) {
  return new Request('http://localhost/api/cron/crm-lifecycle', {
    headers: authorization === undefined ? undefined : { authorization }
  });
}

describe('GET /api/cron/crm-lifecycle', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', SECRET);
    mocks.processCrmLifecycleForPageRequest.mockReset().mockResolvedValue(counts);
  });

  test('processes lifecycle once for the exact configured bearer token and returns only counts', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(counts);
    expect(mocks.processCrmLifecycleForPageRequest).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['absent header', undefined],
    ['malformed bearer header', 'Basic some-token'],
    ['incorrect token', 'Bearer wrong-token']
  ])('rejects %s without processing', async (_label, authorization) => {
    const response = await GET(request(authorization));

    expect(response.status).toBe(401);
    expect(mocks.processCrmLifecycleForPageRequest).not.toHaveBeenCalled();
  });

  test('fails closed when the server secret is absent', async () => {
    vi.stubEnv('CRON_SECRET', '');

    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(401);
    expect(mocks.processCrmLifecycleForPageRequest).not.toHaveBeenCalled();
  });

  test('returns a generic failure without exposing secret or lead data when processing rejects', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.processCrmLifecycleForPageRequest.mockRejectedValue(new Error(`${SECRET} failed for lead sensitive-lead`));

    try {
      const response = await GET(request(`Bearer ${SECRET}`));
      const body = await response.text();

      expect(response.status).toBe(500);
      expect(body).not.toContain(SECRET);
      expect(body).not.toContain('sensitive-lead');
      expect(log).toHaveBeenCalledWith('[api/cron/crm-lifecycle] Processing failed');
    } finally {
      log.mockRestore();
    }
  });
});
