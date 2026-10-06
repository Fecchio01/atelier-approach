import { beforeEach, describe, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ user: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.user }));
vi.mock('../../lib/db', () => ({ prisma: { crmSettings: { findUnique: mocks.findUnique, upsert: mocks.upsert } } }));
import { getFollowUpDelayDays } from '../../lib/commercial-settings';
import { GET, PATCH } from '../../app/api/commercial-settings/route';
const request = (body: unknown) => new Request('http://localhost/api/commercial-settings', { method: 'PATCH', body: JSON.stringify(body) });

describe('shared commercial settings', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: 'member-1' }); });
  test('returns two days before settings exist', async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await getFollowUpDelayDays()).toBe(2);
    expect(await (await GET()).json()).toEqual({ followUpDelayDays: 2 });
  });
  test('reads the stored interval via injected database', async () => {
    expect(await getFollowUpDelayDays({ crmSettings: { findUnique: async () => ({ followUpDelayDays: 5 }) } })).toBe(5);
  });
  test('requires authentication for reading and editing', async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await PATCH(request({ followUpDelayDays: 3 }))).status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  test.each([0, -1, 1.5, '3', 'bad', null, 3651, 2147483647])('rejects invalid delay %j', async (followUpDelayDays) => {
    mocks.upsert.mockResolvedValue({ followUpDelayDays });
    expect((await PATCH(request({ followUpDelayDays }))).status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  test('accepts the supported upper boundary and safely defaults old invalid settings', async () => {
    mocks.upsert.mockResolvedValue({ followUpDelayDays: 3650 });
    expect((await PATCH(request({ followUpDelayDays: 3650 }))).status).toBe(200);
    mocks.findUnique.mockResolvedValue({ followUpDelayDays: 2147483647 });
    expect(await getFollowUpDelayDays()).toBe(2);
  });
  test('upserts the shared singleton and exposes its saved interval', async () => {
    mocks.upsert.mockResolvedValue({ followUpDelayDays: 4 });
    const response = await PATCH(request({ followUpDelayDays: 4 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ followUpDelayDays: 4 });
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { id: 'team' }, create: { id: 'team', followUpDelayDays: 4 }, update: { followUpDelayDays: 4 } });
  });
});
