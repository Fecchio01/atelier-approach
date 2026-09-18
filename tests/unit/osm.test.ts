import { afterEach, describe, expect, test, vi } from 'vitest';

import { OsmRequestScheduler, OsmUnavailableError, createOsmSearchService } from '../../lib/osm';

describe('searchBusinesses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('normalizes a business returned by OpenStreetMap', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            elements: [
              {
                type: 'node',
                id: 100,
                lat: -22.9,
                lon: -47.06,
                tags: {
                  name: 'Auto Brilho',
                  'contact:phone': '+55 19 99999-9999',
                  'contact:website': 'https://autobrilho.example',
                  'contact:instagram': '@autobrilho',
                  image: 'https://autobrilho.example/fachada.jpg'
                }
              },
              {
                type: 'way',
                id: 101,
                tags: {
                  name: 'Brilho Express',
                  phone: '+55 19 98888-8888',
                  website: 'https://brilhoexpress.example',
                  instagram: '@brilhoexpress'
                }
              },
              {
                type: 'relation',
                id: 102,
                tags: { name: 'Estética Centro' }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    const businesses = await service.searchBusinesses({
      niche: 'estética automotiva',
      region: 'Campinas, SP',
      radiusKm: 5
    });

    expect(businesses).toContainEqual(expect.objectContaining({
      osmId: 'node/100', name: 'Auto Brilho', phone: '+55 19 99999-9999', website: 'https://autobrilho.example', instagram: '@autobrilho', imageUrl: 'https://autobrilho.example/fachada.jpg'
    }));
    expect(businesses).toContainEqual(expect.objectContaining({
      osmId: 'way/101', name: 'Brilho Express', phone: '+55 19 98888-8888', website: 'https://brilhoexpress.example', instagram: '@brilhoexpress'
    }));
    expect(businesses).toContainEqual(expect.objectContaining({
      osmId: 'relation/102', name: 'Estética Centro', phone: null, website: null, instagram: null
    }));
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ body: expect.stringContaining('around:5000,-22.9,-47.06') })
    );
  });

  test('uses an identifiable user agent when querying OpenStreetMap', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    await service.searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://overpass-api.de/api/interpreter',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'AtelierApproach/1.0 contato@atelier.local'
        }),
        signal: expect.any(AbortSignal)
      })
    );
  });

  test('retries a failed Overpass request on the fallback endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 })
      )
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            elements: [{ type: 'node', id: 201, lat: -22.9, lon: -47.06, tags: { name: 'Oficina alternativa' } }]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    await expect(service.searchBusinesses({ niche: 'oficina', region: 'Campinas', radiusKm: 5 })).resolves.toEqual([
      expect.objectContaining({ osmId: 'node/201', name: 'Oficina alternativa' })
    ]);
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://overpass.kumi.systems/api/interpreter');
  });

  test('maps Portuguese automotive niches to their canonical OSM tags', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await service.searchBusinesses({ niche: 'lavagem automotiva', region: 'Campinas, SP', radiusKm: 5 });
    await service.searchBusinesses({ niche: 'oficina mecânica', region: 'Campinas, SP', radiusKm: 6 });

    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ body: expect.stringContaining('nwr["amenity"="car_wash"]') })
    );
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({ body: expect.stringContaining('nwr["shop"="car_repair"]') })
    );
  });

  test('includes vehicle repair businesses in an automotive aesthetics search', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await service.searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 });

    const overpassQuery = String(
      fetchMock.mock.calls.find(([url]) => String(url).includes('/api/interpreter'))?.[1]?.body
    );
    expect(overpassQuery).toContain('nwr["amenity"="car_wash"]');
    expect(overpassQuery).toContain('nwr["shop"="car_repair"]');
  });

  test('searches the whole selected state instead of a radius around its center', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: '-22.9', lon: '-43.2' }]), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await service.searchBusinesses({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });

    const overpassQuery = String(
      fetchMock.mock.calls.find(([url]) => String(url).includes('/api/interpreter'))?.[1]?.body
    );
    expect(overpassQuery).toContain('area["name"="Rio de Janeiro"]["boundary"="administrative"]["admin_level"="4"]->.region;');
    expect(overpassQuery).toContain('(area.region)');
    expect(overpassQuery).not.toContain('around:');
  });

  test('requests only tags and coordinates so broad state searches stay responsive', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await service.searchBusinesses({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });

    const overpassQuery = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(overpassQuery).toContain('out center tags 500;');
    expect(overpassQuery).not.toContain('out center meta');
  });

  test('includes service tags used by unmapped automotive detailers', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await service.searchBusinesses({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });

    const overpassQuery = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(overpassQuery).toContain('nwr["service:vehicle:car_wash"="yes"]');
  });

  test('includes repair-tagged automotive businesses in the main state search', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      elements: [{ type: 'node', id: 990, tags: { name: 'Oficina Brilho', shop: 'car_repair' } }]
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 }))
      .resolves.toEqual([expect.objectContaining({ osmId: 'node/990', name: 'Oficina Brilho' })]);

    const stateQuery = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(stateQuery).toContain('nwr["shop"="car_repair"]');
  });

  test('partitions a national search by state areas instead of querying the whole country', async () => {
    const elements = Array.from({ length: 500 }, (_, index) => ({
      type: 'node' as const,
      id: index + 1,
      tags: { name: `Lava Jato ${index + 1}`, amenity: 'car_wash' }
    }));
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ elements }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: '', radiusKm: 50, national: true }))
      .resolves.toHaveLength(500);

    const nationalQuery = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(nationalQuery).toContain('area["name"="São Paulo"]');
    expect(nationalQuery).toContain('nwr["shop"="car_repair"]');
    expect(nationalQuery).toContain('nwr["craft"="car_painter"]');
    expect(nationalQuery).toContain('nwr["shop"="tyres"]');
    expect(nationalQuery).not.toContain('area["ISO3166-1"="BR"][admin_level=2]');
    expect(nationalQuery).not.toContain(';(area.region);');
  });

  test('continues collecting national pages after the first 500 results', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      type: 'node' as const,
      id: index + 1,
      tags: { name: `Lava Jato ${index + 1}`, amenity: 'car_wash' }
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: firstPage }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [
        { type: 'node', id: 9001, tags: { name: 'Lava Jato extra', amenity: 'car_wash' } }
      ] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: '', radiusKm: 50, national: true }))
      .resolves.toContainEqual(expect.objectContaining({ osmId: 'node/9001', name: 'Lava Jato extra' }));
  });

  test('falls back to Nominatim when all national Overpass areas fail', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          osm_type: 'way',
          osm_id: 701,
          lat: '-23.55',
          lon: '-46.63',
          name: 'Auto Brilho',
          type: 'car_wash',
          display_name: 'Auto Brilho, São Paulo, Brasil',
          extratags: { phone: '+55 11 99999-9999', website: 'https://autobrilho.example' }
        }
      ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: '', radiusKm: 50, national: true }))
      .resolves.toEqual([
        expect.objectContaining({ osmId: 'way/701', name: 'Auto Brilho', phone: '+55 11 99999-9999', website: 'https://autobrilho.example' })
      ]);

    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('nominatim.openstreetmap.org/search');
    expect(String(fetchMock.mock.calls[2]?.[1]?.headers?.['User-Agent'])).toContain('AtelierApproach');
  });

  test('searches national fallback batches by state to expand coverage', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { osm_type: 'way', osm_id: 702, name: 'Auto Brilho SP', display_name: 'Auto Brilho SP, São Paulo, Brasil' }
      ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: '', radiusKm: 50, national: true }))
      .resolves.toContainEqual(expect.objectContaining({ osmId: 'way/702', name: 'Auto Brilho SP' }));

    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('nominatim.openstreetmap.org/search');
    expect(String(fetchMock.mock.calls[2]?.[1]?.body ?? fetchMock.mock.calls[2]?.[0])).toContain('S%C3%A3o+Paulo');
  });

  test('returns an empty national result instead of failing when Nominatim is rate limited', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('too many requests', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: '', radiusKm: 50, national: true }))
      .resolves.toEqual([]);
  });

  test('narrows a state search to the whole selected city when requested', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await service.searchBusinesses({
      niche: 'estética automotiva',
      region: 'Rio de Janeiro, RJ',
      city: 'Niterói, RJ',
      radiusKm: 5
    });

    const overpassQuery = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(overpassQuery).toContain('area["name"="Niterói"]["boundary"="administrative"]["admin_level"="8"]->.region;');
    expect(overpassQuery).toContain('(area.region)');
    expect(overpassQuery).not.toContain('around:');
  });

  test('shares a one-request-per-second slot across OSM services', async () => {
    let now = 0;
    const waits: number[] = [];
    const scheduler = new OsmRequestScheduler({
      minIntervalMs: 1_000,
      now: () => now,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
      }
    });

    await scheduler.schedule(async () => 'nominatim');
    await scheduler.schedule(async () => 'overpass');

    expect(waits).toEqual([1_000]);
  });

  test('uses a short-lived cache for an identical search while preserving OSM company fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            elements: [
              {
                type: 'node',
                id: 200,
                lat: -22.9,
                lon: -47.06,
                timestamp: '2026-09-12T10:00:00Z',
                tags: {
                  name: 'Oficina Central',
                  shop: 'car_repair',
                  'addr:street': 'Rua das Flores',
                  'addr:housenumber': '45',
                  'addr:city': 'Campinas',
                  'contact:phone': '+55 19 99999-9999',
                  'contact:website': 'https://oficina.example',
                  'contact:instagram': '@oficinacentral',
                  'contact:whatsapp': '+55 19 98888-8888'
                }
              }
            ]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    const input = { niche: 'oficina mecânica', region: 'Campinas, SP', radiusKm: 5 };

    const first = await service.searchBusinesses(input);
    const second = await service.searchBusinesses(input);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(second).toEqual(first);
    expect(first).toEqual([
      expect.objectContaining({
        address: 'Rua das Flores, 45, Campinas',
        category: 'car_repair',
        latitude: -22.9,
        longitude: -47.06,
        whatsapp: '+55 19 98888-8888',
        lastSyncedAt: '2026-09-12T10:00:00Z'
      })
    ]);
  });

  test('reports an unavailable OSM service without exposing its failure details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('indisponível', { status: 503 })));
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    await expect(
      service.searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 })
    ).rejects.toBeInstanceOf(OsmUnavailableError);
  });
});
