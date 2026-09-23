import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  OsmRequestScheduler,
  OsmSearchSessionExpiredError,
  OsmUnavailableError,
  createOsmSearchService,
  isGenericBusinessName
} from '../../lib/osm';

describe('searchBusinesses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('recognizes category-only labels without discarding a named business', () => {
    expect(isGenericBusinessName('Centro de Estética Automotiva')).toBe(true);
    expect(isGenericBusinessName('Auto Repair')).toBe(true);
    expect(isGenericBusinessName('Centro de Estética Automotiva LK')).toBe(false);
  });

  test('resolves a state or city bounding box for supplemental Overture queries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      lat: '-22.5', lon: '-44.07', boundingbox: ['-22.9', '-22.1', '-44.5', '-43.8']
    }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    const bounds = await service.resolveSearchBounds('Rio de Janeiro, RJ');

    expect(bounds).toEqual({ west: -44.5, south: -22.9, east: -43.8, north: -22.1 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('featuretype=state');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('Rio+de+Janeiro%2C+Brasil');
  });

  test('uses the supported full-country area without geocoding for a Brazil-wide Overture query', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    const bounds = await service.resolveSearchBounds('', undefined, true);

    expect(bounds).toEqual({ west: -73.99, south: -33.75, east: -34.79, north: 5.27 });
    expect(fetchMock).not.toHaveBeenCalled();
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

  test('does not show OSM yes/no tagging values as business categories', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [{
          type: 'node', id: 991, lat: -22.9, lon: -47.06,
          tags: { amenity: 'yes', shop: 'yes', 'service:vehicle:car_wash': 'yes' }
        }]
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    const businesses = await service.searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 });

    expect(businesses[0]?.category).toBe('Lavagem automotiva');
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

  test('merges duplicate OSM records without dropping populated contact fields', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [
          { type: 'node', id: 202, tags: { name: 'Oficina Duplicada', website: 'https://duplicada.example' } },
          { type: 'node', id: 202, tags: { name: 'Oficina Duplicada', phone: '+55 19 99999-9999', 'addr:city': 'Campinas' } }
        ]
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 }))
      .resolves.toEqual([expect.objectContaining({
        osmId: 'node/202',
        website: 'https://duplicada.example',
        phone: '+55 19 99999-9999',
        address: 'Campinas'
      })]);
  });

  test('deduplicates node and way records for the same named business at the same location', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [
          { type: 'node', id: 301, lat: -22.901, lon: -47.061, tags: { name: 'HR Car Wash', phone: '+55 19 90000-0000' } },
          { type: 'way', id: 302, center: { lat: -22.9011, lon: -47.0611 }, tags: { name: 'HR Car Wash', website: 'https://hrwash.example' } }
        ]
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 }))
      .resolves.toEqual([expect.objectContaining({ name: 'HR Car Wash', phone: '+55 19 90000-0000', website: 'https://hrwash.example' })]);
  });

  test('keeps branches with the same trade name when they are in different locations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ lat: '-22.9', lon: '-47.06' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [
          { type: 'node', id: 311, lat: -22.901, lon: -47.061, tags: { name: 'Auto Brilho' } },
          { type: 'way', id: 312, center: { lat: -22.95, lon: -47.1 }, tags: { name: 'Auto Brilho' } }
        ]
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: 'Campinas, SP', radiusKm: 5 }))
      .resolves.toHaveLength(2);
  });

  test('builds a street-level address from Nominatim address details, without repeating the place name', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          osm_type: 'node', osm_id: 401, name: 'Estética Brilho', display_name: 'Estética Brilho, Rua das Flores, Campinas, São Paulo, Brasil',
          address: { road: 'Rua das Flores', house_number: '25', suburb: 'Centro', city: 'Campinas', state: 'São Paulo', postcode: '13000-000' },
          lat: '-22.901', lon: '-47.061', extratags: { amenity: 'car_wash' }
        }
      ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: '', radiusKm: 5, national: true }))
      .resolves.toContainEqual(expect.objectContaining({ osmId: 'node/401', name: 'Estética Brilho', address: 'Rua das Flores, 25, Centro, Campinas, São Paulo, 13000-000' }));
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
    expect(overpassQuery).toContain('out center tags 1000;');
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

  test('broadens automotive searches with business-name variations and a higher state result ceiling', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await service.searchBusinesses({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });

    const stateQuery = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(stateQuery).toContain('detalhamento');
    expect(stateQuery).toContain('higieniza');
    expect(stateQuery).toContain('funilaria');
    expect(stateQuery).toContain('auto.?pecas');
    expect(stateQuery).toContain('out center tags 1000;');
  });

  test('enriches missing contacts from a company website already listed in OSM', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [{ type: 'node', id: 992, tags: { name: 'Car Wash', amenity: 'car_wash', website: 'https://site-enrich-992.test' } }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(
        '<meta property="og:site_name" content="Estética Direta"><a href="https://wa.me/5511999990000">WhatsApp</a><a href="https://instagram.com/esteticadireta">Instagram</a>',
        { status: 200 }
      ));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    const businesses = await service.searchBusinesses({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(businesses).toContainEqual(expect.objectContaining({
      osmId: 'node/992',
      name: 'Estética Direta',
      whatsapp: 'https://wa.me/5511999990000',
      instagram: 'https://instagram.com/esteticadireta'
    }));
  });

  test('looks up OSM namedetails for nameless Overpass businesses before showing them', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [{ type: 'way', id: 996, center: { lat: -22.91, lon: -43.2 }, tags: { amenity: 'car_wash' } }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        osm_type: 'way', osm_id: 996, name: 'Brilho Car',
        namedetails: { name: 'Brilho Car', 'name:pt': 'Estética Brilho Car', brand: 'Brilho' }
      }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    const businesses = await service.searchBusinesses({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('nominatim.openstreetmap.org/lookup');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('osm_ids=W996');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('namedetails=1');
    expect(businesses).toContainEqual(expect.objectContaining({ osmId: 'way/996', name: 'Estética Brilho Car' }));
  });

  test('uses alternate business names and contact tags without presenting a category as a company name', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [
          {
            type: 'node', id: 993,
            tags: {
              name: 'Auto Repair', brand: 'Brilho Premium', shop: 'car_repair',
              'contact:mobile': '+55 11 99999-0000',
              'contact:instagram:url': 'https://instagram.com/brilhopremium',
              'contact:whatsapp': 'https://wa.me/5511999990001'
            }
          },
          { type: 'way', id: 994, tags: { name: 'Car Wash', amenity: 'car_wash' } },
          { type: 'node', id: 995, tags: { shop: 'car_repair' } }
        ]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    const businesses = await service.searchBusinesses({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });

    expect(businesses).toContainEqual(expect.objectContaining({
      osmId: 'node/993', name: 'Brilho Premium', phone: '+55 11 99999-0000',
      instagram: 'https://instagram.com/brilhopremium', whatsapp: 'https://wa.me/5511999990001',
      category: 'Oficina mecânica'
    }));
    expect(businesses).toContainEqual(expect.objectContaining({
      osmId: 'way/994', name: 'Nome comercial não informado', category: 'Lavagem automotiva'
    }));
    expect(businesses).toContainEqual(expect.objectContaining({
      osmId: 'node/995', name: 'Nome comercial não informado', category: 'Oficina mecânica'
    }));
  });

  test('recognizes alternate OSM website tags when the standard website tag is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      elements: [{
        type: 'node',
        id: 991,
        tags: {
          name: 'Oficina URL',
          shop: 'car_repair',
          url: 'www.oficina-url.example'
        }
      }]
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 }))
      .resolves.toEqual([expect.objectContaining({ osmId: 'node/991', website: 'www.oficina-url.example' })]);
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
    expect(nationalQuery).toContain('nwr["shop"="car"]');
    expect(nationalQuery).toContain('nwr["service:vehicle:repair"="yes"]');
    expect(nationalQuery).toContain('nwr["name"~"');
    expect(nationalQuery).toContain('garage');
    expect(nationalQuery).toContain('out center tags 1000');
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

  test('supplements a sparse national Overpass result with Nominatim records', async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ elements: [{ type: 'node', id: 910, tags: { name: 'Oficina OSM', shop: 'car_repair' } }] }), { status: 200 });
      }
      if (input.includes('nominatim.openstreetmap.org/search')) {
        return new Response(JSON.stringify([
          { osm_type: 'way', osm_id: 911, name: 'Oficina Nominatim', display_name: 'Oficina Nominatim, São Paulo, Brasil' }
        ]), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });
    await expect(service.searchBusinesses({ niche: 'estética automotiva', region: '', radiusKm: 50, national: true }))
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ osmId: 'node/910', name: 'Oficina OSM' }),
        expect.objectContaining({ osmId: 'way/911', name: 'Oficina Nominatim' })
      ]));
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
    const nominatimUrl = new URL(String(fetchMock.mock.calls[2]?.[0]));
    expect(nominatimUrl.searchParams.get('limit')).toBe('40');
    expect(nominatimUrl.searchParams.get('namedetails')).toBe('1');
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
    expect(overpassQuery).toContain('area["name"="Rio de Janeiro"]["boundary"="administrative"]["admin_level"="4"]->.state;');
    expect(overpassQuery).toContain('rel(area.state)["name"="Niterói"]["boundary"="administrative"];');
    expect(overpassQuery).toContain('map_to_area->.region;');
    expect(overpassQuery).toContain('(area.region)');
    expect(overpassQuery).not.toContain('around:');
  });

  test('queries any selected Brazilian state as its full administrative area', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ elements: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    await service.searchBusinesses({ niche: 'estética automotiva', region: 'Acre, AC', radiusKm: 50 });

    const overpassQuery = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(overpassQuery).toContain('area["name"="Acre"]["boundary"="administrative"]["admin_level"="4"]->.region;');
    expect(overpassQuery).toContain('(area.region)');
    expect(overpassQuery).not.toContain('around:');
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
                  'contact:whatsapp': '+55 19 98888-8888',
                  image: 'https://oficina.example/fachada.jpg'
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
    expect(first).toEqual([
      expect.objectContaining({
        address: 'Rua das Flores, 45, Campinas',
        category: 'Oficina mecânica',
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

  test('returns distinct progressive batches for a search session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [{ type: 'node', id: 1, tags: { name: 'Oficina Tags', shop: 'car_repair' } }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [
          { type: 'node', id: 1, tags: { name: 'Oficina Tags repetida' } },
          { type: 'node', id: 2, tags: { name: 'Oficina Nome' } }
        ]
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    const started = await service.startSearch({
      niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5
    });

    expect(started).toMatchObject({
      searchId: expect.any(String),
      businesses: [
        expect.objectContaining({ osmId: 'node/1', name: 'Oficina Tags' }),
        expect.objectContaining({ osmId: 'node/2', name: 'Oficina Nome' })
      ],
      hasMore: true
    });
  });

  test('accumulates five new businesses in each progressive batch when national units have them', async () => {
    const fetchMock = vi.fn();
    for (const id of Array.from({ length: 10 }, (_, index) => index + 1)) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
        elements: [{ type: 'node', id, tags: { name: `Oficina ${id}`, shop: 'car_repair' } }]
      }), { status: 200 }));
    }
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    const started = await service.startSearch({
      niche: 'estética automotiva', region: '', radiusKm: 50, national: true
    });
    const continued = await service.continueSearch(started.searchId);

    expect(started.businesses.map((business) => business.osmId)).toEqual([
      'node/1', 'node/2', 'node/3', 'node/4', 'node/5'
    ]);
    expect(started.hasMore).toBe(true);
    expect(continued.businesses.map((business) => business.osmId)).toEqual([
      'node/6', 'node/7', 'node/8', 'node/9', 'node/10'
    ]);
    expect(continued.hasMore).toBe(true);
  });

  test('rejects an unknown progressive-search session', async () => {
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    await expect(service.continueSearch('missing-session')).rejects.toBeInstanceOf(OsmSearchSessionExpiredError);
  });

  test('expires an inactive progressive-search session after fifteen minutes', async () => {
    let currentTime = 0;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ elements: [] }), { status: 200 })));
    const service = createOsmSearchService({
      scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }),
      now: () => currentTime
    });
    const started = await service.startSearch({
      niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5
    });
    currentTime = 15 * 60_000;

    await expect(service.continueSearch(started.searchId)).rejects.toBeInstanceOf(OsmSearchSessionExpiredError);
  });

  test('removes abandoned expired sessions when a later search starts', async () => {
    let currentTime = 0;
    const searchSessions = new Map();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ elements: [] }), { status: 200 })));
    const service = createOsmSearchService({
      scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }),
      now: () => currentTime,
      searchSessions
    });

    await service.startSearch({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });
    expect(searchSessions.size).toBe(1);

    currentTime = 15 * 60_000;
    await service.startSearch({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });

    expect(searchSessions.size).toBe(1);
  });

  test('uses a short Overpass timeout before a progressive fallback', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('overpass')) return new Response('unavailable', { status: 503 });
      return new Response(JSON.stringify([{
        osm_type: 'node', osm_id: 6, name: 'Oficina Rápida', lat: '-22.9', lon: '-43.2',
        extratags: { shop: 'car_repair' }
      }]), { status: 200 });
    }));
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    await service.startSearch({ niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5 });

    expect(timeoutSpy).toHaveBeenCalledWith(3_000);
  });

  test('uses a regional Nominatim fallback when a progressive Overpass unit is unavailable', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('overpass')) return new Response('unavailable', { status: 503 });
      return new Response(JSON.stringify([{
        osm_type: 'node',
        osm_id: 5,
        name: 'Detalhamento Local',
        lat: '-22.9',
        lon: '-43.2',
        extratags: { shop: 'car_repair' }
      }]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    const started = await service.startSearch({
      niche: 'estética automotiva', region: 'Rio de Janeiro, RJ', radiusKm: 5
    });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('nominatim.openstreetmap.org'), expect.anything());
    expect(started).toMatchObject({
      businesses: [expect.objectContaining({ osmId: 'node/5', name: 'Detalhamento Local' })],
      hasMore: true
    });
  });

  test('skips a sibling unit after its area succeeds through the progressive fallback', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('nominatim')) {
        return new Response(JSON.stringify([{
          osm_type: 'node', osm_id: 10, name: 'Detalhamento Paulista', lat: '-23.5', lon: '-46.6',
          extratags: { shop: 'car_repair' }
        }]), { status: 200 });
      }
      const query = String(init?.body);
      if (query.includes('name"="São Paulo"')) return new Response('unavailable', { status: 503 });
      return new Response(JSON.stringify({
        elements: [{ type: 'node', id: 11, tags: { name: 'Oficina Carioca', shop: 'car_repair' } }]
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = createOsmSearchService({ scheduler: new OsmRequestScheduler({ minIntervalMs: 0 }) });

    const started = await service.startSearch({
      niche: 'estética automotiva', region: '', radiusKm: 50, national: true
    });

    expect(started.businesses).toEqual([
      expect.objectContaining({ osmId: 'node/10' }),
      expect.objectContaining({ osmId: 'node/11' })
    ]);
    expect(started.hasMore).toBe(false);
    expect(fetchMock.mock.calls.filter(([, init]) => String((init as RequestInit | undefined)?.body).includes('name"="São Paulo"')))
      .toHaveLength(2);
  });
});
