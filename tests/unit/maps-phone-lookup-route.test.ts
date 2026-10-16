import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.user }));
import { POST } from '../../app/api/research/phone-lookup/route';

const business = { name: 'Café das Flores', city: 'Campinas', region: 'SP', address: 'Rua das Flores, 100' };
const candidate = { ...business, phone: '+551932224444' };
const request = (body: unknown = { business }) => new Request('http://localhost/api/research/phone-lookup', { method: 'POST', body: JSON.stringify(body) });
let fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  mocks.user.mockReset().mockResolvedValue({ id: crypto.randomUUID() });
  vi.stubEnv('MAPS_TO_LEAD_PHONE_API_URL', 'https://phone.example.test');
  vi.stubEnv('MAPS_TO_LEAD_PHONE_API_TOKEN', 'private-service-token');
  fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ candidates: [candidate] }));
  vi.stubGlobal('fetch', fetchImpl);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('POST /api/research/phone-lookup', () => {
  test('requires authentication before accepting input or contacting the provider', async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    null, [], {}, { business: null }, { business: [] },
    { business: { ...business, name: '' } }, { business: { ...business, name: 'a'.repeat(301) } },
    { business: { ...business, city: ' ' } }, { business: { ...business, city: 'a'.repeat(151) } },
    { business: { ...business, region: 'XX' } }, { business: { ...business, region: 'São Paulo' } },
    { business: { ...business, address: 1 } }, { business: { ...business, address: 'a'.repeat(501) } },
    { business: { ...business, name: 'Name\nInjected query' } }
  ])('rejects malformed business input %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('rejects malformed JSON', async () => {
    const response = await POST(new Request('http://localhost/api/research/phone-lookup', { method: 'POST', body: '{broken' }));
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each(['MAPS_TO_LEAD_PHONE_API_URL', 'MAPS_TO_LEAD_PHONE_API_TOKEN'])('returns unavailable when %s is absent', async (variable) => {
    vi.stubEnv(variable, '');
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('normalizes identity fields and excludes every CRM-only value from the upstream request', async () => {
    const response = await POST(request({ business: { ...business, name: ' Café das Flores ', region: 'sp', id: 'crm-private', notes: 'notes-private', phone: '+5511999999999' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'matched', candidate });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ companyName: 'Café das Flores', city: 'Campinas', region: 'SP', address: 'Rua das Flores, 100' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  test.each([
    [[{ ...candidate, city: 'Santos' }], 'none'],
    [[candidate, { ...candidate, phone: '+551932225555' }], 'ambiguous'],
    [[], 'none']
  ])('applies strict matching before exposing any number', async (candidates, status) => {
    fetchImpl.mockResolvedValue(Response.json({ candidates }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status });
  });

  test('returns a sanitized provider failure', async () => {
    fetchImpl.mockResolvedValue(new Response('private-service-token +551932224444', { status: 502 }));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Não foi possível consultar o telefone agora.' });
  });

  test('returns unavailable after provider timeout', async () => {
    vi.useFakeTimers();
    fetchImpl.mockImplementation(() => new Promise(() => {}));
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(45_000);
    expect((await pending).status).toBe(503);
  });

  test('allows five lookups per user each minute and keeps users independent', async () => {
    vi.useFakeTimers();
    mocks.user.mockResolvedValue({ id: 'throttle-user' });
    for (let index = 0; index < 5; index++) expect((await POST(request())).status).toBe(200);
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    mocks.user.mockResolvedValue({ id: 'other-throttle-user' });
    expect((await POST(request())).status).toBe(200);
    mocks.user.mockResolvedValue({ id: 'throttle-user' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await POST(request())).status).toBe(200);
  });
});
