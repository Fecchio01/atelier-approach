import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  searchBusinesses: vi.fn()
}));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('../../lib/osm', () => {
  class OsmUnavailableError extends Error {}

  return { OsmUnavailableError, searchBusinesses: mocks.searchBusinesses };
});

import { GET } from '../../app/api/search/route';
import { OsmUnavailableError } from '../../lib/osm';

describe('GET /api/search', () => {
  test('returns a Portuguese-friendly 503 when OpenStreetMap is unavailable', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'internal-equipe' });
    mocks.searchBusinesses.mockRejectedValue(new OsmUnavailableError());

    const response = await GET(
      new Request('http://localhost/api/search?niche=est%C3%A9tica&region=Campinas&radiusKm=5')
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'A busca no OpenStreetMap está indisponível no momento. Tente novamente em alguns instantes.'
    });
  });

  test('limits repeated searches from the same authenticated user', async () => {
    mocks.getCurrentUser.mockReset();
    mocks.searchBusinesses.mockReset();
    mocks.getCurrentUser.mockResolvedValue({ id: 'rate-limit-user' });
    mocks.searchBusinesses.mockResolvedValue([]);
    const request = () =>
      new Request('http://localhost/api/search?niche=est%C3%A9tica&region=Campinas&radiusKm=5');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await GET(request())).status).toBe(200);
    }

    const response = await GET(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'Muitas buscas em pouco tempo. Aguarde um minuto antes de tentar novamente.'
    });
  });
});
