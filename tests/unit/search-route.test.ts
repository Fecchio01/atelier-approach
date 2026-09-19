import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  startSearch: vi.fn(),
  continueSearch: vi.fn(),
  createOsmSearchService: vi.fn()
}));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('../../lib/osm', () => {
  class OsmUnavailableError extends Error {}
  class OsmSearchSessionExpiredError extends Error {}

  mocks.createOsmSearchService.mockReturnValue({
    startSearch: mocks.startSearch,
    continueSearch: mocks.continueSearch
  });

  return { OsmUnavailableError, OsmSearchSessionExpiredError, createOsmSearchService: mocks.createOsmSearchService };
});

import { GET } from '../../app/api/search/route';
import { prisma } from '../../lib/db';
import { OsmSearchSessionExpiredError, OsmUnavailableError } from '../../lib/osm';

describe('GET /api/search', () => {
  test('returns a Portuguese-friendly 503 when OpenStreetMap is unavailable', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'internal-equipe' });
    mocks.startSearch.mockRejectedValue(new OsmUnavailableError());

    const response = await GET(
      new Request('http://localhost/api/search?niche=est%C3%A9tica&region=Campinas&radiusKm=5')
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'A pesquisa está indisponível no momento. Tente novamente em alguns instantes.'
    });
  });

  test('limits repeated searches from the same authenticated user', async () => {
    mocks.getCurrentUser.mockReset();
    mocks.startSearch.mockReset();
    mocks.getCurrentUser.mockResolvedValue({ id: 'rate-limit-user' });
    mocks.startSearch.mockResolvedValue({ businesses: [], searchId: 'rate-limit-search', hasMore: false });
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

  test('does not return businesses already registered as leads', async () => {
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.lead.create({ data: { osmId: 'node/registered' } });
    mocks.getCurrentUser.mockResolvedValue({ id: 'lead-filter-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: [{
        osmId: 'node/registered',
        name: 'Já cadastrado',
        phone: null,
        website: null,
        instagram: null
      },
      {
        osmId: 'node/new',
        name: 'Novo prospect',
        phone: null,
        website: null,
        instagram: null
      }],
      searchId: 'lead-filter-search',
      hasMore: true
    });

    const response = await GET(
      new Request('http://localhost/api/search?niche=est%C3%A9tica&region=Campinas&radiusKm=5')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      businesses: [
        {
          osmId: 'node/new',
          name: 'Novo prospect',
          phone: null,
          website: null,
          instagram: null
        }
      ],
      searchId: 'lead-filter-search',
      hasMore: true
    });
  });

  test('applies research filters and can include companies already worked in the CRM', async () => {
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.lead.deleteMany();
    const workedLead = await prisma.lead.create({ data: { osmId: 'node/worked' } });
    mocks.getCurrentUser.mockResolvedValue({ id: 'filtered-search-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: [{
        osmId: 'node/worked',
        name: 'Oficina já trabalhada',
        phone: '+55 19 99999-0000',
        website: 'https://oficina.example',
        instagram: '@oficina',
        address: 'Rua das Flores, 45, Campinas',
        category: 'car_repair',
        latitude: -22.9,
        longitude: -47.06,
        whatsapp: '+55 19 98888-0000',
        lastSyncedAt: '2026-09-12T10:00:00Z'
      },
      {
        osmId: 'node/no-digital',
        name: 'Sem presença digital',
        phone: '+55 19 97777-0000',
        website: null,
        instagram: null
      }],
      searchId: 'filtered-search',
      hasMore: false
    });

    const response = await GET(new Request(
      'http://localhost/api/search?niche=oficina%20mec%C3%A2nica&region=Campinas&radiusKm=5&phoneOnly=true&digitalPresence=true&minScore=15&maxScore=15&includeWorked=true'
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      businesses: [
        expect.objectContaining({
          osmId: 'node/worked',
          alreadyWorked: true,
          crmHref: `/crm?lead=${workedLead.id}`,
          address: 'Rua das Flores, 45, Campinas',
          category: 'car_repair',
          latitude: -22.9,
          longitude: -47.06,
          phone: '+55 19 99999-0000',
          website: 'https://oficina.example',
          instagram: '@oficina',
          whatsapp: '+55 19 98888-0000',
          lastSyncedAt: '2026-09-12T10:00:00Z'
        })
      ],
      searchId: 'filtered-search',
      hasMore: false
    });
  });

  test('continues a search by id while preserving its CRM filters', async () => {
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.lead.create({ data: { osmId: 'node/worked-on-next-batch' } });
    mocks.getCurrentUser.mockResolvedValue({ id: 'continuation-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: [],
      searchId: 'search-to-continue',
      hasMore: true
    });
    mocks.continueSearch.mockResolvedValue({
      businesses: [
        { osmId: 'node/worked-on-next-batch', name: 'Já trabalhado', phone: null, website: null, instagram: null },
        { osmId: 'node/new-on-next-batch', name: 'Novo', phone: null, website: null, instagram: null }
      ],
      hasMore: false
    });

    await GET(new Request('http://localhost/api/search?niche=oficina&region=Campinas'));
    const response = await GET(new Request('http://localhost/api/search?searchId=search-to-continue'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      businesses: [
        { osmId: 'node/new-on-next-batch', name: 'Novo', phone: null, website: null, instagram: null }
      ],
      searchId: 'search-to-continue',
      hasMore: false
    });
  });

  test('returns a generic 410 when a search session has expired', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'expired-search-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: [],
      searchId: 'expired-search',
      hasMore: true
    });
    mocks.continueSearch.mockRejectedValue(new OsmSearchSessionExpiredError());

    await GET(new Request('http://localhost/api/search?niche=oficina&region=Campinas'));
    const response = await GET(new Request('http://localhost/api/search?searchId=expired-search'));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: 'Sua busca expirou. Inicie uma nova pesquisa para continuar.'
    });
  });
});
