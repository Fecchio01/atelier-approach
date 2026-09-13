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
                  'contact:instagram': '@autobrilho'
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
      osmId: 'node/100', name: 'Auto Brilho', phone: '+55 19 99999-9999', website: 'https://autobrilho.example', instagram: '@autobrilho'
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

  test('does not mix vehicle repair businesses into an automotive aesthetics search', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await service.searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 });

    const overpassQuery = String(fetchMock.mock.calls[1]?.[1]?.body);
    expect(overpassQuery).toContain('nwr["amenity"="car_wash"]');
    expect(overpassQuery).not.toContain('nwr["shop"="car_repair"]');
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
