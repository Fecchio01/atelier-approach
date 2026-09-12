import { afterEach, describe, expect, test, vi } from 'vitest';

import { OsmUnavailableError, searchBusinesses } from '../../lib/osm';

describe('searchBusinesses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('normalizes a business returned by OpenStreetMap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
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
      )
    );

    const businesses = await searchBusinesses({
      niche: 'estética automotiva',
      region: 'Campinas, SP',
      radiusKm: 5
    });

    expect(businesses).toContainEqual({
      osmId: 'node/100',
      name: 'Auto Brilho',
      phone: '+55 19 99999-9999',
      website: 'https://autobrilho.example',
      instagram: '@autobrilho'
    });
    expect(businesses).toContainEqual({
      osmId: 'way/101',
      name: 'Brilho Express',
      phone: '+55 19 98888-8888',
      website: 'https://brilhoexpress.example',
      instagram: '@brilhoexpress'
    });
    expect(businesses).toContainEqual({
      osmId: 'relation/102',
      name: 'Estética Centro',
      phone: null,
      website: null,
      instagram: null
    });
  });

  test('uses an identifiable user agent when querying OpenStreetMap', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ elements: [] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 });

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

  test('reports an unavailable OSM service without exposing its failure details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('indisponível', { status: 503 })));

    await expect(
      searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 })
    ).rejects.toBeInstanceOf(OsmUnavailableError);
  });
});
