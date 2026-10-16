import { afterEach, describe, expect, test, vi } from 'vitest';
import { lookupMapsPhone } from '../../lib/maps-phone-service';

const business = { name: 'Café das Flores', city: 'Campinas', region: 'SP', address: 'Rua das Flores, 100' };
const candidate = { name: 'Café das Flores', phone: '+551932224444', address: 'Rua das Flores, 100', city: 'Campinas', region: 'SP' };
const options = { baseUrl: 'https://phone.example.test/', token: 'private-service-token' };

afterEach(() => vi.useRealTimers());

describe('Maps phone service boundary', () => {
  test('sends only company identity and location with server credentials and no caching', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [candidate] }));
    const selectedBusiness = { ...business, leadId: 'private-lead', notes: 'private', phone: '+5511999999999' };
    const result = await lookupMapsPhone(selectedBusiness, { ...options, fetchImpl });
    expect(result).toEqual({ status: 'matched', candidate });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://phone.example.test/lookup');
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer private-service-token', 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(init?.body))).toEqual({ companyName: 'Café das Flores', city: 'Campinas', region: 'SP', address: 'Rua das Flores, 100' });
  });

  test.each([
    ['wrong city', [{ ...candidate, city: 'Santos' }], 'none'],
    ['wrong UF', [{ ...candidate, region: 'RJ' }], 'none'],
    ['wrong name', [{ ...candidate, name: 'Outra empresa' }], 'none'],
    ['wrong address number', [{ ...candidate, address: 'Rua das Flores, 900' }], 'none'],
    ['ambiguous', [candidate, { ...candidate, phone: '+551932225555' }], 'ambiguous'],
    ['no results', [], 'none'],
    ['no phone', [{ ...candidate, phone: null }], 'none']
  ])('returns no phone for %s', async (_label, candidates, status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates }));
    expect(await lookupMapsPhone(business, { ...options, fetchImpl })).toEqual({ status });
  });

  test.each([
    null, {}, { candidates: 'bad' }, { candidates: [null] },
    { candidates: [{ ...candidate, name: 10 }] },
    { candidates: [{ ...candidate, phone: '+550032224444' }] },
    { candidates: [{ ...candidate, phone: '+551234' }] },
    { candidates: [{ ...candidate, phone: '+551980012345' }] },
    { candidates: [{ ...candidate, city: undefined }] },
    { candidates: [{ ...candidate, address: {} }] },
    { candidates: Array.from({ length: 6 }, () => candidate) }
  ])('rejects malformed upstream response %j', async (body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(lookupMapsPhone(business, { ...options, fetchImpl })).rejects.toThrow('Não foi possível consultar o telefone agora.');
  });

  test('never exposes extra fields received from the provider', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ ...candidate, token: 'upstream-secret', whatsapp: true }] }));
    expect(await lookupMapsPhone(business, { ...options, fetchImpl })).toEqual({ status: 'matched', candidate });
  });

  test.each([502, 401])('sanitizes upstream HTTP %i errors', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('private-service-token +551932224444', { status }));
    await expect(lookupMapsPhone(business, { ...options, fetchImpl })).rejects.toThrow('Não foi possível consultar o telefone agora.');
  });

  test('sanitizes network and malformed JSON failures', async () => {
    for (const fetchImpl of [vi.fn<typeof fetch>().mockRejectedValue(new Error('private-service-token')), vi.fn<typeof fetch>().mockResolvedValue(new Response('not json'))]) {
      await expect(lookupMapsPhone(business, { ...options, fetchImpl })).rejects.toThrow('Não foi possível consultar o telefone agora.');
    }
  });

  test('aborts a stalled request at the default 45-second deadline', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const pending = expect(lookupMapsPhone(business, { ...options, fetchImpl })).rejects.toThrow('Não foi possível consultar o telefone agora.');
    await vi.advanceTimersByTimeAsync(44_999);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  test('caps an overridden timeout at 45 seconds', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const pending = expect(lookupMapsPhone(business, { ...options, fetchImpl, timeoutMs: 90_000 })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(45_000);
    await pending;
  });
});
