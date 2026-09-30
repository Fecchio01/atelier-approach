import { describe, expect, test } from 'vitest';
import { DuckDBInstance } from '@duckdb/node-api';

import { buildDuckDbInstanceConfig, buildOvertureQuery, buildStacFileQuery, mergeBusinessSources, normalizeOverturePlaces, planOvertureSearchAreas, searchOvertureBusinesses, splitOvertureSearchArea } from '../../lib/overture';

describe('Overture automotive places', () => {
  test('configures DuckDB home and extensions in Vercel writable temporary storage at startup', async () => {
    const instance = await DuckDBInstance.create(':memory:', buildDuckDbInstanceConfig('/tmp/atelier-approach/duckdb'));
    const connection = await instance.connect();

    try {
      const reader = await connection.runAndReadAll(`
        SELECT current_setting('home_directory') AS home_directory,
          current_setting('extension_directory') AS extension_directory
      `);

      expect(reader.getRowObjectsJS()).toEqual([
        {
          home_directory: '/tmp/atelier-approach/duckdb',
          extension_directory: '/tmp/atelier-approach/duckdb/extensions'
        }
      ]);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });

  test('starts a national search around major cities and keeps other areas available', () => {
    const areas = planOvertureSearchAreas({ west: -73.99, south: -33.75, east: -34.79, north: 5.27 }, true);

    expect(areas.length).toBeGreaterThan(1000);
    expect(areas[0]).toMatchObject({ depth: 0 });
    expect(areas[0].west).toBeLessThan(-43.2);
    expect(areas[0].east).toBeGreaterThan(-43.2);
    expect(areas[0].south).toBeLessThan(-22.9);
    expect(areas[0].north).toBeGreaterThan(-22.9);
    expect(areas.some((area) => area.west <= -46.63 && area.east >= -46.63 && area.south <= -23.55 && area.north >= -23.55)).toBe(true);
  });

  test('splits a full search area so subsequent batches can discover additional named businesses', () => {
    const children = splitOvertureSearchArea({ west: -44, south: -23, east: -43, north: -22, depth: 0 });

    expect(children).toHaveLength(4);
    expect(children.every((area) => area.depth === 1)).toBe(true);
    expect(children).toEqual(expect.arrayContaining([
      expect.objectContaining({ west: -44, east: -43.5, south: -23, north: -22.5 }),
      expect.objectContaining({ west: -43.5, east: -43, south: -22.5, north: -22 })
    ]));
  });
  test('uses the STAC spatial index to select only files overlapping the requested area', () => {
    const sql = buildStacFileQuery({ west: -44.5, south: -22.9, east: -43.8, north: -22.1 }, '2026-08-19.0');

    expect(sql).toContain('https://stac.overturemaps.org/2026-08-19.0/collections.parquet');
    expect(sql).toContain("LIKE '%/theme=places/type=place/%'");
    expect(sql).toContain('bbox.xmin <= -43.8');
    expect(sql).toContain('bbox.xmax >= -44.5');
  });

  test('queries selected place files instead of scanning the global wildcard', () => {
    const path = 's3://overturemaps-us-west-2/release/2026-08-19.0/theme=places/type=place/part-00000-test.parquet';
    const sql = buildOvertureQuery({ west: -44.5, south: -22.9, east: -43.8, north: -22.1 }, '2026-08-19.0', [path]);

    expect(sql).toContain(path);
    expect(sql).not.toContain('type=place/*');
    expect(sql).not.toContain("coalesce(array_to_string(taxonomy.hierarchy, ' '), '')");
    expect(sql).toContain('ST_X(geometry) AS longitude');
    expect(sql).toContain('ST_Y(geometry) AS latitude');
    expect(sql).not.toContain('bbox.ymin AS latitude');
    expect(sql).not.toContain('bbox.xmin AS longitude');
    expect(() => buildOvertureQuery({ west: -44.5, south: -22.9, east: -43.8, north: -22.1 }, '2026-08-19.0', ['s3://elsewhere/file.parquet'])).toThrow('arquivos Overture inválidos');
  });

  test('normalizes a named automotive business and its contact channels', () => {
    const businesses = normalizeOverturePlaces([{
      id: 'gers-123',
      name: 'Brilho Premium',
      category: 'auto_detailing',
      address: 'Rua das Flores, 10, Centro',
      phone: '+55 24 3333-4444',
      website: 'https://brilhopremium.example',
      socials: 'https://instagram.com/brilhopremium',
      latitude: -22.5,
      longitude: -44.07,
      operating_status: 'open',
      confidence: 0.92
    }]);

    expect(businesses).toEqual([expect.objectContaining({
      osmId: 'overture/gers-123',
      name: 'Brilho Premium',
      category: 'auto_detailing',
      address: 'Rua das Flores, 10, Centro',
      phone: '+55 24 3333-4444',
      website: 'https://brilhopremium.example',
      instagram: 'https://instagram.com/brilhopremium',
      latitude: -22.5,
      longitude: -44.07,
      source: 'Overture'
    })]);
  });

  test('classifies social and WhatsApp URLs instead of exposing them as websites', () => {
    const businesses = normalizeOverturePlaces([{
      id: 'social-1', name: 'Oficina Central', category: 'automotive_repair',
      website: 'https://instagram.com/oficinacentral',
      socials: 'https://wa.me/5521999999999 https://instagram.com/oficinacentral',
      latitude: -22.9, longitude: -43.2
    }]);

    expect(businesses[0]).toMatchObject({
      website: null,
      instagram: 'https://instagram.com/oficinacentral',
      whatsapp: 'https://wa.me/5521999999999'
    });
  });

  test('keeps city and region in the address used for identifying the business', () => {
    const businesses = normalizeOverturePlaces([{
      id: 'address-1', name: 'Oficina Central', category: 'automotive_repair',
      address: 'Rua das Flores, 10', locality: 'Rio de Janeiro', region: 'RJ', country: 'BR',
      latitude: -22.9, longitude: -43.2
    }]);

    expect(businesses[0].address).toBe('Rua das Flores, 10, Rio de Janeiro, RJ, Brasil');
  });

  test('keeps automotive service types beyond car washes, while excluding unrelated and closed places', () => {
    const businesses = normalizeOverturePlaces([
      { id: 'repair', name: 'Oficina do Vale', category: 'automotive_repair', latitude: -22.5, longitude: -44.07 },
      { id: 'tire', name: 'Pneus Central', category: 'tire_shop', latitude: -22.5, longitude: -44.07 },
      { id: 'cafe', name: 'Café Central', category: 'cafe', latitude: -22.5, longitude: -44.07 },
      { id: 'wine', name: 'Oficina do Vinho', category: 'winery', latitude: -22.5, longitude: -44.07 },
      { id: 'music', name: 'Oficina de Música BST', category: 'music_production', latitude: -22.5, longitude: -44.07 },
      { id: 'beauty', name: 'Espaço de Estética Andreya Gomes', category: 'beauty_salon', latitude: -22.5, longitude: -44.07 },
      { id: 'retirement', name: 'Amor em Foco - Casa de Repouso', category: 'retirement_home', latitude: -22.5, longitude: -44.07 },
      { id: 'retirement-tire', name: 'Residencial Cantinho dos Avós', category: 'retirement_home', latitude: -22.5, longitude: -44.07 },
      { id: 'insurance', name: '100 Agenda Corretora de Seguros', category: 'automotive_repair', latitude: -22.5, longitude: -44.07 },
      { id: 'detran', name: 'Detran/Rj', category: 'automotive_repair', latitude: -22.5, longitude: -44.07 },
      { id: 'protection', name: 'By Motors Proteção Veicular RJ', category: 'automotive_repair', latitude: -22.5, longitude: -44.07 },
      { id: 'closed', name: 'Oficina Encerrada', category: 'auto_repair', operating_status: 'permanently_closed', latitude: -22.5, longitude: -44.07 }
    ]);

    expect(businesses.map((business) => business.osmId)).toEqual(['overture/repair', 'overture/tire']);
  });

  test('does not return a place without a verifiable trade name', () => {
    const businesses = normalizeOverturePlaces([
      { id: 'unnamed', name: null, category: 'auto_repair', latitude: -22.5, longitude: -44.07 }
    ]);

    expect(businesses).toEqual([]);
  });

  test('merges the same named place across sources and preserves Overture-only businesses', () => {
    const merged = mergeBusinessSources([
      { osmId: 'node/1', name: 'Brilho Premium', phone: null, website: null, instagram: null, latitude: -22.5, longitude: -44.07, source: 'OpenStreetMap' }
    ], [
      { osmId: 'overture/1', name: 'Brilho Premium', phone: '+5524999999999', website: null, instagram: null, latitude: -22.50001, longitude: -44.07001, source: 'Overture' },
      { osmId: 'overture/2', name: 'Oficina do Vale', phone: null, website: null, instagram: null, latitude: -22.51, longitude: -44.08, source: 'Overture' }
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ osmId: 'node/1', phone: '+5524999999999', source: 'OpenStreetMap + Overture' });
    expect(merged[1]).toMatchObject({ osmId: 'overture/2', name: 'Oficina do Vale', source: 'Overture' });
  });

  test('uses a nearby Overture trade name to enrich an unnamed OSM record without changing its CRM id', () => {
    const merged = mergeBusinessSources([
      { osmId: 'way/1112521130', name: 'Nome comercial não informado', phone: null, website: null, instagram: null, latitude: -22.5010482, longitude: -44.0736817, category: 'Oficina mecânica', source: 'OpenStreetMap' }
    ], [
      { osmId: 'overture/gers-123', name: 'Auto Brilho Volta Redonda', phone: '+5524999999999', website: null, instagram: null, latitude: -22.50105, longitude: -44.07368, category: 'auto_repair', source: 'Overture' }
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      osmId: 'way/1112521130',
      name: 'Auto Brilho Volta Redonda',
      phone: '+5524999999999',
      source: 'OpenStreetMap + Overture'
    });
  });

  test.skipIf(process.env.RUN_OVERTURE_LIVE !== '1')('queries real Overture places around the shared Volta Redonda map location', async () => {
    const businesses = await searchOvertureBusinesses({ west: -44.1, south: -22.55, east: -44, north: -22.45 });

    expect(businesses.length).toBeGreaterThan(0);
    expect(businesses.some((business) => /car clean/i.test(business.name))).toBe(true);
    expect(businesses.every((business) => business.name !== 'Nome comercial não informado')).toBe(true);
    expect(businesses.every((business) => Number.isFinite(business.latitude) && Number.isFinite(business.longitude))).toBe(true);
  }, 90_000);

  test.skipIf(process.env.RUN_OVERTURE_LIVE !== '1')('returns named places with valid coordinates across Brazil', async () => {
    const businesses = await searchOvertureBusinesses({ west: -73.99, south: -33.75, east: -34.79, north: 5.27 });

    expect(businesses.length).toBeGreaterThan(0);
    expect(businesses.every((business) => business.source === 'Overture')).toBe(true);
    expect(businesses.every((business) => business.name !== 'Nome comercial não informado')).toBe(true);
    expect(businesses.every((business) => Number.isFinite(business.latitude) && Number.isFinite(business.longitude))).toBe(true);
  }, 120_000);

  test.skipIf(process.env.RUN_OVERTURE_LIVE !== '1')('returns named businesses from a Rio de Janeiro city tile', async () => {
    const businesses = await searchOvertureBusinesses({ west: -44, south: -23, east: -43, north: -22 });

    expect(businesses.length).toBeGreaterThan(5);
    expect(businesses.every((business) => business.source === 'Overture')).toBe(true);
  }, 90_000);
});
