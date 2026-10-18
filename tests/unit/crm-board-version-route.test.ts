import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getCrmBoardVersion: vi.fn() }));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('../../lib/crm-board-version', () => ({ getCrmBoardVersion: mocks.getCrmBoardVersion }));

import { GET } from '../../app/api/crm/board-version/route';

describe('GET /api/crm/board-version', () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset().mockResolvedValue({ id: 'team-member' });
    mocks.getCrmBoardVersion.mockReset().mockResolvedValue('7:12:2026-10-17T12:00:00.000Z');
  });

  it('returns an uncached shared version only to authenticated team members', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ version: '7:12:2026-10-17T12:00:00.000Z' });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects unauthenticated requests', async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.getCrmBoardVersion).not.toHaveBeenCalled();
  });
});
