import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  startSearch: vi.fn(),
  continueSearch: vi.fn(),
  resolveSearchBounds: vi.fn(),
  createOsmSearchService: vi.fn(),
  isGenericBusinessName: (name: string) => new Set([
    'auto repair', 'automotive repair', 'auto center', 'oficina mecanica',
    'lavagem automotiva', 'centro de estetica automotiva'
  ]).has(name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()),
  searchOvertureBusinesses: vi.fn(),
  searchOvertureArea: vi.fn(),
  planOvertureSearchAreas: vi.fn(),
  splitOvertureSearchArea: vi.fn()
}));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('../../lib/osm', () => {
  class OsmUnavailableError extends Error {}
  class OsmSearchSessionExpiredError extends Error {}

  mocks.createOsmSearchService.mockReturnValue({
    startSearch: mocks.startSearch,
    continueSearch: mocks.continueSearch,
    resolveSearchBounds: mocks.resolveSearchBounds
  });

  return {
    OsmUnavailableError,
    OsmSearchSessionExpiredError,
    createOsmSearchService: mocks.createOsmSearchService,
    isGenericBusinessName: mocks.isGenericBusinessName
  };
});
vi.mock('../../lib/overture', () => ({
  searchOvertureBusinesses: mocks.searchOvertureBusinesses,
  searchOvertureArea: mocks.searchOvertureArea,
  planOvertureSearchAreas: mocks.planOvertureSearchAreas,
  splitOvertureSearchArea: mocks.splitOvertureSearchArea,
  mergeBusinessSources: (osmBusinesses: unknown[], overtureBusinesses: unknown[]) => [...osmBusinesses, ...overtureBusinesses]
}));

import { GET } from '../../app/api/search/route';
import { prisma } from '../../lib/db';
import { OsmSearchSessionExpiredError, OsmUnavailableError } from '../../lib/osm';

describe('GET /api/search', () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.startSearch.mockReset();
    mocks.continueSearch.mockReset();
    mocks.resolveSearchBounds.mockReset().mockResolvedValue(null);
    mocks.searchOvertureBusinesses.mockReset().mockResolvedValue([]);
    mocks.searchOvertureArea.mockReset().mockResolvedValue({ businesses: [], hitLimit: false });
    mocks.planOvertureSearchAreas.mockReset().mockReturnValue([{ west: -44.2, south: -22.6, east: -44, north: -22.4, depth: 0 }]);
    mocks.splitOvertureSearchArea.mockReset().mockReturnValue([]);
  });

  test('uses Overture for a national search and discovers new companies on later clicks', async () => {
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'national-overture-first-user' });
    mocks.resolveSearchBounds.mockResolvedValue({ west: -73.99, south: -33.75, east: -34.79, north: 5.27 });
    const firstArea = { west: -44, south: -23, east: -43, north: -22, depth: 0 };
    const secondArea = { west: -47, south: -24, east: -46, north: -23, depth: 0 };
    mocks.planOvertureSearchAreas.mockReturnValue([firstArea, secondArea]);
    mocks.searchOvertureArea.mockImplementation(async (area: typeof firstArea) => ({
      businesses: area === firstArea
        ? Array.from({ length: 65 }, (_, index) => ({
            osmId: `overture/rio-${index}`, name: `Estética Rio ${index}`, phone: null, website: null, instagram: null,
            latitude: -22.9, longitude: -43.2, source: 'Overture'
          }))
        : Array.from({ length: 7 }, (_, index) => ({
            osmId: `overture/sp-${index}`, name: `Oficina São Paulo ${index}`, phone: null, website: null, instagram: null,
            latitude: -23.55, longitude: -46.63, source: 'Overture'
          })),
      hitLimit: false
    }));

    const firstResponse = await GET(new Request('http://localhost/api/search?niche=est%C3%A9tica%20automotiva&national=true'));
    const first = await firstResponse.json() as { businesses: Array<{ osmId: string; source: string }>; searchId: string; hasMore: boolean };
    const second = await (await GET(new Request(`http://localhost/api/search?searchId=${first.searchId}`))).json() as typeof first;
    const third = await (await GET(new Request(`http://localhost/api/search?searchId=${first.searchId}`))).json() as typeof first;

    expect(first.businesses).toHaveLength(60);
    expect(second.businesses).toHaveLength(5);
    expect(third.businesses).toHaveLength(7);
    expect([...first.businesses, ...second.businesses, ...third.businesses].every((business) => business.source === 'Overture')).toBe(true);
    expect(new Set([...first.businesses, ...second.businesses, ...third.businesses].map((business) => business.osmId)).size).toBe(72);
    expect(third.hasMore).toBe(false);
    expect(mocks.startSearch).not.toHaveBeenCalled();
    expect(mocks.searchOvertureArea).toHaveBeenCalledTimes(2);
  });

  test('returns Overture names and contacts without querying OSM', async () => {
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'overture-search-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: Array.from({ length: 5 }, (_, index) => ({
        osmId: `node/osm-${index + 1}`, name: `Oficina OSM ${index + 1}`, phone: null, website: null, instagram: null, source: 'OpenStreetMap'
      })),
      searchId: 'overture-search-1',
      hasMore: true
    });
    mocks.resolveSearchBounds.mockResolvedValue({ west: -44.2, south: -22.6, east: -44, north: -22.4 });
    mocks.searchOvertureArea.mockResolvedValue({ businesses: [{
      osmId: 'overture/gers-1', name: 'Auto Brilho', phone: '+5524999999999', website: 'https://autobrilho.example', instagram: null,
      latitude: -22.5, longitude: -44.07, source: 'Overture'
    }], hitLimit: false });

    const response = await GET(new Request('http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro%2C%20RJ&radiusKm=50'));

    expect(response.status).toBe(200);
    const payload = await response.json() as { businesses: Array<{ osmId: string; name: string; source?: string }>; hasMore: boolean };
    expect(payload.businesses).toEqual([expect.objectContaining({
      osmId: 'overture/gers-1', name: 'Auto Brilho', phone: '+5524999999999', source: 'Overture'
    })]);
    expect(payload.hasMore).toBe(false);
    expect(mocks.startSearch).not.toHaveBeenCalled();
  });

  test('presents named Overture places ahead of OSM-only places', async () => {
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'overture-primary-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: Array.from({ length: 5 }, (_, index) => ({
        osmId: `node/osm-primary-${index}`, name: `Oficina ${index}`, phone: null, website: null, instagram: null, source: 'OpenStreetMap'
      })),
      searchId: 'overture-primary-search',
      hasMore: false
    });
    mocks.resolveSearchBounds.mockResolvedValue({ west: -44.2, south: -22.6, east: -44, north: -22.4 });
    mocks.searchOvertureArea.mockResolvedValue({ businesses: [{
      osmId: 'overture/zeta-detailing', name: 'Zeta Detailing', phone: null, website: null, instagram: null,
      latitude: -22.5, longitude: -44.07, source: 'Overture'
    }], hitLimit: false });

    const response = await GET(new Request('http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro'));
    const payload = await response.json() as { businesses: Array<{ osmId: string }> };

    expect(payload.businesses[0]?.osmId).toBe('overture/zeta-detailing');
    expect(mocks.startSearch).not.toHaveBeenCalled();
  });

  test('keeps OSM results if Overture is temporarily unavailable', async () => {
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'overture-fallback-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: [{ osmId: 'node/osm-fallback', name: 'Oficina OSM', phone: null, website: null, instagram: null }],
      searchId: 'overture-fallback',
      hasMore: false
    });
    mocks.resolveSearchBounds.mockResolvedValue({ west: -44.2, south: -22.6, east: -44, north: -22.4 });
    mocks.searchOvertureArea.mockRejectedValue(new Error('Overture unavailable'));

    const response = await GET(new Request('http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro%2C%20RJ'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ businesses: [{ osmId: 'node/osm-fallback' }] });
  });

  test('serves named Overture results when OpenStreetMap is unavailable', async () => {
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'overture-fallback-primary-user' });
    mocks.startSearch.mockRejectedValue(new OsmUnavailableError());
    mocks.resolveSearchBounds.mockResolvedValue({ west: -44.2, south: -22.6, east: -44, north: -22.4 });
    mocks.searchOvertureArea.mockResolvedValue({ businesses: [{
      osmId: 'overture/auto-brilho', name: 'Auto Brilho', phone: null, website: null, instagram: null,
      latitude: -22.5, longitude: -44.07, source: 'Overture'
    }], hitLimit: false });

    const response = await GET(new Request('http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ businesses: [{ osmId: 'overture/auto-brilho', source: 'Overture' }] });
  });

  test('does not show companies without a verifiable trade name', async () => {
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'named-search-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: [
        { osmId: 'node/unnamed', name: 'Nome comercial não informado', phone: '+5524999999999', website: null, instagram: null },
        { osmId: 'node/named', name: 'Auto Brilho Volta Redonda', phone: null, website: null, instagram: null }
      ],
      searchId: 'named-search',
      hasMore: false
    });

    const response = await GET(new Request('http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro'));

    await expect(response.json()).resolves.toMatchObject({
      businesses: [expect.objectContaining({ osmId: 'node/named', name: 'Auto Brilho Volta Redonda' })]
    });
  });

  test('filters category labels mistakenly returned as business names', async () => {
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'generic-name-filter-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: [
        { osmId: 'node/category-center', name: 'Centro de Estética Automotiva', phone: null, website: null, instagram: null },
        { osmId: 'node/category-workshop', name: 'Oficina Mecânica', phone: null, website: null, instagram: null },
        { osmId: 'overture/category-wash', name: 'Lavagem automotiva', phone: null, website: null, instagram: null },
        { osmId: 'node/proper-name', name: 'Centro de Estética Automotiva LK', phone: null, website: null, instagram: null }
      ],
      searchId: 'generic-name-filter-search',
      hasMore: false
    });

    const response = await GET(new Request('http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Bahia'));
    const payload = await response.json() as { businesses: Array<{ osmId: string; name: string }> };

    expect(payload.businesses).toEqual([
      expect.objectContaining({ osmId: 'node/proper-name', name: 'Centro de Estética Automotiva LK' })
    ]);
  });

  test('pages Overture results through the existing load-more search flow', async () => {
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'overture-pagination-user' });
    mocks.startSearch.mockResolvedValue({ businesses: [], searchId: 'overture-pagination', hasMore: false });
    mocks.resolveSearchBounds.mockResolvedValue({ west: -44.2, south: -22.6, east: -44, north: -22.4 });
    mocks.searchOvertureArea.mockResolvedValue({ businesses: Array.from({ length: 70 }, (_, index) => ({
      osmId: `overture/${index}`, name: `Oficina ${index}`, phone: null, website: null, instagram: null, source: 'Overture' as const
    })), hitLimit: false });
    mocks.continueSearch.mockResolvedValue({ businesses: [], hasMore: false });

    const firstResponse = await GET(new Request('http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro%2C%20RJ'));
    const firstPayload = await firstResponse.json() as { businesses: Array<{ osmId: string }>; searchId: string; hasMore: boolean };
    const nextResponse = await GET(new Request(`http://localhost/api/search?searchId=${firstPayload.searchId}`));
    const nextPayload = await nextResponse.json() as { businesses: Array<{ osmId: string }>; hasMore: boolean };

    expect(firstPayload.businesses).toHaveLength(60);
    expect(firstPayload.hasMore).toBe(true);
    expect(nextPayload.businesses).toHaveLength(10);
    expect(nextPayload.hasMore).toBe(false);
  });

  test('uses the Overture initial batch before spending time on extra OSM backfill requests', async () => {
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'overture-first-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: [{ osmId: 'node/osm-first', name: 'Oficina OSM', phone: null, website: null, instagram: null }],
      searchId: 'overture-first',
      hasMore: true
    });
    mocks.resolveSearchBounds.mockResolvedValue({ west: -44.2, south: -22.6, east: -44, north: -22.4 });
    mocks.searchOvertureArea.mockResolvedValue({ businesses: Array.from({ length: 70 }, (_, index) => ({
      osmId: `overture/initial-${index}`, name: `Empresa automotiva ${index}`, phone: null, website: null, instagram: null, source: 'Overture' as const
    })), hitLimit: false });
    mocks.continueSearch.mockResolvedValue({ businesses: [], hasMore: true });

    const response = await GET(new Request('http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro'));
    const payload = await response.json() as { businesses: Array<{ osmId: string }>; hasMore: boolean };

    expect(payload.businesses).toHaveLength(60);
    expect(payload.hasMore).toBe(true);
    expect(mocks.continueSearch).not.toHaveBeenCalled();
    expect(mocks.startSearch).not.toHaveBeenCalled();
  });

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
      hasMore: false
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
      hasMore: false
    });
  });

  test('automatically continues until the initial batch is filled with new prospects', async () => {
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.lead.deleteMany();
    const workedIds = Array.from({ length: 5 }, (_, index) => `node/worked-${index}`);
    await prisma.lead.createMany({ data: workedIds.map((osmId) => ({ osmId })) });
    mocks.getCurrentUser.mockResolvedValue({ id: 'auto-backfill-user' });
    mocks.startSearch.mockResolvedValueOnce({
      businesses: workedIds.map((osmId) => ({
        osmId, name: 'Já no CRM', phone: null, website: null, instagram: null
      })),
      searchId: 'auto-backfill-search',
      hasMore: true
    });
    mocks.continueSearch.mockResolvedValueOnce({
      businesses: Array.from({ length: 5 }, (_, index) => ({
        osmId: `node/new-${index}`, name: `Novo prospect ${index}`, phone: null, website: null, instagram: null
      })),
      hasMore: true
    });

    const response = await GET(new Request(
      'http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro'
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      businesses: Array.from({ length: 5 }, (_, index) => expect.objectContaining({
        osmId: `node/new-${index}`, name: `Novo prospect ${index}`
      })),
      searchId: 'auto-backfill-search',
      hasMore: true
    });
    expect(mocks.continueSearch).toHaveBeenCalledWith('auto-backfill-search');
  });

  test('keeps the usable first results if automatic backfill later fails', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'partial-backfill-user' });
    mocks.startSearch.mockResolvedValueOnce({
      businesses: Array.from({ length: 2 }, (_, index) => ({
        osmId: `node/partial-${index}`, name: `Prospect ${index}`, phone: null, website: null, instagram: null
      })),
      searchId: 'partial-backfill-search',
      hasMore: true
    });
    mocks.continueSearch.mockRejectedValueOnce(new OsmUnavailableError());

    const response = await GET(new Request(
      'http://localhost/api/search?niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro'
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      businesses: expect.arrayContaining([
        expect.objectContaining({ osmId: 'node/partial-0' }),
        expect.objectContaining({ osmId: 'node/partial-1' })
      ]),
      searchId: 'partial-backfill-search',
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
      businesses: Array.from({ length: 5 }, (_, index) => ({
        osmId: `node/initial-${index}`, name: `Inicial ${index}`, phone: null, website: null, instagram: null
      })),
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

  test('keeps advancing through duplicates until a progressive page has five new prospects', async () => {
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockResolvedValue({ id: 'progressive-five-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: Array.from({ length: 60 }, (_, index) => ({
        osmId: `node/initial-${index}`, name: `Inicial ${index}`, phone: null, website: null, instagram: null
      })),
      searchId: 'progressive-five-search',
      hasMore: true
    });
    mocks.continueSearch
      .mockResolvedValueOnce({ businesses: [{ osmId: 'node/initial-0', name: 'Duplicado', phone: null, website: null, instagram: null }], hasMore: true })
      .mockResolvedValueOnce({
        businesses: Array.from({ length: 5 }, (_, index) => ({
          osmId: `node/new-${index}`, name: `Novo ${index}`, phone: null, website: null, instagram: null
        })),
        hasMore: true
      });

    await GET(new Request('http://localhost/api/search?niche=oficina&region=Campinas'));
    const response = await GET(new Request('http://localhost/api/search?searchId=progressive-five-search'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      businesses: Array.from({ length: 5 }, (_, index) => expect.objectContaining({ osmId: `node/new-${index}` })),
      hasMore: true
    });
    expect(mocks.continueSearch).toHaveBeenCalledTimes(2);
  });

  test('returns a generic 410 when a search session has expired', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'expired-search-user' });
    mocks.startSearch.mockResolvedValue({
      businesses: Array.from({ length: 5 }, (_, index) => ({
        osmId: `node/initial-expired-${index}`, name: `Inicial ${index}`, phone: null, website: null, instagram: null
      })),
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

  test('keeps route filters active when successful continuations span more than fifteen minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
    try {
      mocks.getCurrentUser.mockResolvedValue({ id: 'sliding-expiration-user' });
      mocks.startSearch.mockResolvedValue({
        businesses: Array.from({ length: 5 }, (_, index) => ({
          osmId: `node/initial-sliding-${index}`, name: `Inicial ${index}`, phone: null, website: null, instagram: null
        })),
        searchId: 'sliding-expiration-search',
        hasMore: true
      });
      mocks.continueSearch.mockResolvedValue({ businesses: [], hasMore: true });

      await GET(new Request('http://localhost/api/search?niche=oficina&region=Campinas'));
      await vi.advanceTimersByTimeAsync(14 * 60_000);
      expect((await GET(new Request('http://localhost/api/search?searchId=sliding-expiration-search'))).status).toBe(200);

      await vi.advanceTimersByTimeAsync(14 * 60_000);
      expect((await GET(new Request('http://localhost/api/search?searchId=sliding-expiration-search'))).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
