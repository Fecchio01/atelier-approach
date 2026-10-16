import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn(), upsert: vi.fn() }));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.user }));
vi.mock('../../lib/db', () => ({ prisma: { researchDismissal: { upsert: mocks.upsert } } }));

import { POST } from '../../app/api/research/dismissals/route';

const request = (body: string) => new Request('http://localhost/api/research/dismissals', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body
});

describe('research dismissal route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.mockResolvedValue({ id: 'member-1' });
    mocks.upsert.mockResolvedValue({ id: 'dismissal-1' });
  });

  test('requires authentication', async () => {
    mocks.user.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify({ osmId: 'overture/abc' })));

    expect(response.status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  test.each([
    ['malformed JSON', '{'],
    ['non-object body', JSON.stringify(null)],
    ['missing ID', JSON.stringify({})],
    ['non-string ID', JSON.stringify({ osmId: 123 })],
    ['non-Overture ID', JSON.stringify({ osmId: 'node/abc' })],
    ['empty provider ID', JSON.stringify({ osmId: 'overture/' })],
    ['provider ID over 200 characters', JSON.stringify({ osmId: `overture/${'a'.repeat(201)}` })]
  ])('rejects %s', async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  test('uses the authenticated owner and ignores an owner supplied in JSON', async () => {
    const response = await POST(request(JSON.stringify({ osmId: 'overture/abc', ownerId: 'attacker' })));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { ownerId_osmId: { ownerId: 'member-1', osmId: 'overture/abc' } },
      create: { ownerId: 'member-1', osmId: 'overture/abc' },
      update: {}
    });
  });

  test('repeated valid requests are idempotent for the authenticated owner', async () => {
    const body = JSON.stringify({ osmId: 'overture/abc' });

    expect((await POST(request(body))).status).toBe(204);
    expect((await POST(request(body))).status).toBe(204);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0]).toEqual(mocks.upsert.mock.calls[1]);
  });
});
