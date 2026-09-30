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
  searchOvertureArea: vi.fn(),
  planOvertureSearchAreas: vi.fn(),
  splitOvertureSearchArea: vi.fn()
}));

vi.mock('../../lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('../../lib/osm', () => {
  mocks.createOsmSearchService.mockReturnValue({
    startSearch: mocks.startSearch,
    continueSearch: mocks.continueSearch,
    resolveSearchBounds: mocks.resolveSearchBounds
  });

  return {
    createOsmSearchService: mocks.createOsmSearchService,
    isGenericBusinessName: mocks.isGenericBusinessName
  };
});
vi.mock('../../lib/overture', () => ({
  searchOvertureArea: mocks.searchOvertureArea,
  planOvertureSearchAreas: mocks.planOvertureSearchAreas,
  splitOvertureSearchArea: mocks.splitOvertureSearchArea
}));

import { GET } from '../../app/api/search/route';
import { prisma } from '../../lib/db';
import type { ExternalBusiness } from '../../lib/osm';

const DEFAULT_BOUNDS = { west: -44.2, south: -22.6, east: -44, north: -22.4 };
const FIRST_AREA = { ...DEFAULT_BOUNDS, depth: 0 };
const SECOND_AREA = { west: -44.4, south: -22.8, east: -44.2, north: -22.6, depth: 0 };

function business(id: string, name: string, fields: Partial<ExternalBusiness> = {}): ExternalBusiness {
  return {
    osmId: `overture/${id}`,
    name,
    phone: null,
    website: null,
    instagram: null,
    whatsapp: null,
    address: 'Rua das Flores, 45, Volta Redonda, RJ',
    category: 'automotive_repair',
    latitude: -22.5,
    longitude: -44.07,
    source: 'Overture',
    ...fields
  };
}

function request(params = 'niche=est%C3%A9tica%20automotiva&region=Rio%20de%20Janeiro') {
  return new Request(`http://localhost/api/search?${params}`);
}

describe('GET /api/search', () => {
  beforeEach(async () => {
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.lead.deleteMany();
    mocks.getCurrentUser.mockReset().mockResolvedValue({ id: `search-user-${crypto.randomUUID()}` });
    mocks.startSearch.mockReset();
    mocks.continueSearch.mockReset();
    mocks.resolveSearchBounds.mockReset().mockResolvedValue(DEFAULT_BOUNDS);
    mocks.searchOvertureArea.mockReset().mockResolvedValue({ businesses: [], hitLimit: false });
    mocks.planOvertureSearchAreas.mockReset().mockReturnValue([FIRST_AREA]);
    mocks.splitOvertureSearchArea.mockReset().mockReturnValue([]);
  });

  test('returns only real Overture records and never uses OSM business search', async () => {
    mocks.searchOvertureArea.mockResolvedValue({
      businesses: [business('gers-1', 'Auto Brilho Volta Redonda', { phone: '+5524999999999' })],
      hitLimit: false
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      businesses: [{ osmId: 'overture/gers-1', name: 'Auto Brilho Volta Redonda', source: 'Overture' }],
      hasMore: false
    });
    expect(mocks.startSearch).not.toHaveBeenCalled();
    expect(mocks.continueSearch).not.toHaveBeenCalled();
  });

  test('does not disguise Overture failures by returning OpenStreetMap businesses', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.startSearch.mockResolvedValue({
      businesses: [business('osm-fallback', 'Empresa que não deve aparecer', { source: 'OpenStreetMap' })],
      searchId: 'osm-fallback',
      hasMore: false
    });
    mocks.searchOvertureArea.mockRejectedValue(new Error('Overture unavailable'));

    try {
      const response = await GET(request());

      expect(response.status).toBe(503);
      expect(mocks.startSearch).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('Overture') });
    } finally {
      log.mockRestore();
    }
  });

  test('logs the failing Overture area and original error for production diagnosis', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.searchOvertureArea.mockRejectedValue(new Error('extension directory is read-only'));

    try {
      const response = await GET(request());

      expect(response.status).toBe(503);
      expect(log).toHaveBeenCalledWith('[api/search] Overture area query failed', {
        area: FIRST_AREA,
        error: expect.objectContaining({ name: 'Error', message: 'extension directory is read-only' })
      });
    } finally {
      log.mockRestore();
    }
  });

  test('reports when region bounds cannot be resolved instead of switching data sources', async () => {
    mocks.resolveSearchBounds.mockRejectedValue(new Error('Geocoder unavailable'));

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(mocks.startSearch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining('limites dessa região') });
  });

  test('filters generic category labels from Overture results but keeps named businesses', async () => {
    mocks.searchOvertureArea.mockResolvedValue({
      businesses: [
        business('generic', 'Oficina Mecânica'),
        business('wash', 'Lavagem automotiva'),
        business('named', 'Centro de Estética Automotiva LK')
      ],
      hitLimit: false
    });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      businesses: [{ osmId: 'overture/named', name: 'Centro de Estética Automotiva LK' }]
    });
  });

  test('paginates Overture results without repeating records', async () => {
    const firstPage = Array.from({ length: 65 }, (_, index) => business(`rio-${index}`, `Estética Rio ${index}`));
    const secondArea = Array.from({ length: 7 }, (_, index) => business(`sp-${index}`, `Oficina São Paulo ${index}`, {
      latitude: -23.55, longitude: -46.63
    }));
    mocks.planOvertureSearchAreas.mockReturnValue([FIRST_AREA, SECOND_AREA]);
    mocks.searchOvertureArea
      .mockResolvedValueOnce({ businesses: firstPage, hitLimit: false })
      .mockResolvedValueOnce({ businesses: secondArea, hitLimit: false });

    const firstResponse = await GET(request('niche=est%C3%A9tica%20automotiva&national=true'));
    const first = await firstResponse.json() as { businesses: ExternalBusiness[]; searchId: string; hasMore: boolean };
    const second = await (await GET(request(`searchId=${first.searchId}`))).json() as typeof first;
    const third = await (await GET(request(`searchId=${first.searchId}`))).json() as typeof first;

    expect(first.businesses).toHaveLength(60);
    expect(second.businesses).toHaveLength(5);
    expect(third.businesses).toHaveLength(7);
    expect([...first.businesses, ...second.businesses, ...third.businesses].every(({ source }) => source === 'Overture')).toBe(true);
    expect(new Set([...first.businesses, ...second.businesses, ...third.businesses].map(({ osmId }) => osmId)).size).toBe(72);
    expect(third.hasMore).toBe(false);
    expect(mocks.startSearch).not.toHaveBeenCalled();
  });

  test('suppresses duplicate Overture listings for the same named location across areas', async () => {
    const repeatedListing = business('orange-original', 'Orange Car Wash', { latitude: -22.9, longitude: -43.2 });
    mocks.planOvertureSearchAreas.mockReturnValue([FIRST_AREA, SECOND_AREA]);
    mocks.searchOvertureArea
      .mockResolvedValueOnce({
        businesses: [repeatedListing, ...Array.from({ length: 4 }, (_, index) => business(`initial-${index}`, `Oficina Inicial ${index}`))],
        hitLimit: false
      })
      .mockResolvedValueOnce({
        businesses: [
          business('orange-duplicate', 'Orange Car Wash', { latitude: -22.9, longitude: -43.2 }),
          ...Array.from({ length: 5 }, (_, index) => business(`next-${index}`, `Oficina Nova ${index}`, {
            latitude: -22.7 - index / 100,
            longitude: -44.1
          }))
        ],
        hitLimit: false
      });

    const first = await (await GET(request())).json() as { businesses: ExternalBusiness[]; searchId: string };
    const next = await (await GET(request(`searchId=${first.searchId}`))).json() as { businesses: ExternalBusiness[] };

    expect(first.businesses.filter(({ name }) => name === 'Orange Car Wash')).toHaveLength(1);
    expect(next.businesses.some(({ name }) => name === 'Orange Car Wash')).toBe(false);
    expect(next.businesses.map(({ osmId }) => osmId)).toEqual(Array.from({ length: 5 }, (_, index) => `overture/next-${index}`));
  });

  test('does not return Overture businesses already registered as CRM leads', async () => {
    await prisma.lead.create({ data: { osmId: 'overture/registered' } });
    mocks.searchOvertureArea.mockResolvedValue({
      businesses: [business('registered', 'Já cadastrado'), business('new', 'Novo prospect')],
      hitLimit: false
    });

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      businesses: [{ osmId: 'overture/new', name: 'Novo prospect' }]
    });
  });

  test('applies search filters and includes already-worked Overture companies when requested', async () => {
    const workedLead = await prisma.lead.create({ data: { osmId: 'overture/worked' } });
    mocks.searchOvertureArea.mockResolvedValue({
      businesses: [
        business('worked', 'Oficina já trabalhada', {
          phone: '+55 19 99999-0000', instagram: '@oficina',
          address: 'Rua das Flores, 45, Campinas', latitude: -22.9, longitude: -47.06
        }),
        business('no-digital', 'Sem presença digital', { phone: '+55 19 97777-0000' })
      ],
      hitLimit: false
    });

    const response = await GET(request('niche=oficina&region=Campinas&phoneOnly=true&digitalPresence=true&includeWorked=true'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      businesses: [expect.objectContaining({
        osmId: 'overture/worked',
        alreadyWorked: true,
        crmHref: `/crm?lead=${workedLead.id}`,
        address: 'Rua das Flores, 45, Campinas',
        latitude: -22.9,
        longitude: -47.06,
        phone: '+55 19 99999-0000',
        website: null,
        instagram: '@oficina'
      })]
    });
  });

  test('preserves CRM filters while loading the next Overture area', async () => {
    await prisma.lead.create({ data: { osmId: 'overture/worked-next' } });
    mocks.planOvertureSearchAreas.mockReturnValue([FIRST_AREA, SECOND_AREA]);
    mocks.searchOvertureArea
      .mockResolvedValueOnce({ businesses: Array.from({ length: 5 }, (_, index) => business(`initial-${index}`, `Inicial ${index}`)), hitLimit: false })
      .mockResolvedValueOnce({ businesses: [business('worked-next', 'Já trabalhado'), business('new-next', 'Novo')], hitLimit: false });

    const first = await (await GET(request('niche=oficina&region=Campinas&includeWorked=false'))).json() as { searchId: string };
    const response = await GET(request(`searchId=${first.searchId}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      businesses: [{ osmId: 'overture/new-next', name: 'Novo' }],
      hasMore: false
    });
  });

  test('limits repeated searches from the same authenticated user', async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: 'rate-limit-user' });
    const makeRequest = () => request();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await GET(makeRequest())).status).toBe(200);
    }

    const response = await GET(makeRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'Muitas buscas em pouco tempo. Aguarde um minuto antes de tentar novamente.'
    });
    expect(mocks.startSearch).not.toHaveBeenCalled();
  });

  test('expires a search session when the client supplies an unknown search id', async () => {
    const response = await GET(request('searchId=expired-search-id'));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: 'Sua busca expirou. Inicie uma nova pesquisa para continuar.'
    });
  });
});
