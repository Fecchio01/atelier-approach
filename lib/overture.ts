import { DuckDBInstance } from '@duckdb/node-api';

import { isGenericBusinessName } from './osm';
import type { ExternalBusiness } from './osm';
import type { SearchBounds } from './osm';

const STAC_CATALOG_URL = 'https://stac.overturemaps.org/catalog.json';
const USER_AGENT = 'AtelierApproach/1.0 contato@atelier.local';
const MAX_OVERTURE_RESULTS = 100;
const OVERTURE_QUERY_TIMEOUT_MS = 45_000;
const CATALOG_TTL_MS = 6 * 60 * 60_000;
const QUERY_CACHE_TTL_MS = 10 * 60_000;

type OvertureRow = Record<string, unknown>;
type QueryExecutor = (sql: string) => Promise<OvertureRow[]>;
type CachedValue<T> = { expiresAt: number; value: T };
export type OvertureSearchArea = SearchBounds & { depth: number };
export type OvertureAreaResult = { businesses: ExternalBusiness[]; hitLimit: boolean };

const queryCache = new Map<string, CachedValue<OvertureAreaResult>>();
let cachedCatalog: CachedValue<string> | null = null;
let duckDbPromise: Promise<DuckDBInstance> | null = null;

const AUTO_SERVICE_PATTERN = /automotive|auto[ _-](repair|body|parts|electrical|detailing|glass|service|tire)|car[ _](wash|repair|detail|service|parts|body)|vehicle[ _](repair|inspection)|tire|tyre|oil[ _]change|mechanic|oficina[ _](mecanica|automotiva)|mecanica[ _]automotiva|estetica[ _]automotiva|detalhamento[ _]automotivo|lavagem[ _]automotiva|lava[ _-]?jato|lava[ _-]?rapido|polimento[ _]automotivo|funilaria|martelinho|higienizacao[ _]automotiva|auto[ _-]?center|borracharia|pneus|insulfilm|troca[ _]de[ _]oleo/i;
const UNRELATED_AUTO_PLACE_PATTERN = /retirement home|casa de repouso|residencial senior|corretora de seguros|insurance|detran|protecao veicular|clube de beneficios/i;
const INSTAGRAM_URL = /https?:\/\/(?:www\.)?instagram\.com\/[\w.-]+\/?/i;

const NATIONAL_FOCUS_POINTS = [
  { longitude: -43.2, latitude: -22.9 }, // Rio de Janeiro
  { longitude: -46.63, latitude: -23.55 }, // São Paulo
  { longitude: -38.5, latitude: -12.97 }, // Salvador
  { longitude: -43.94, latitude: -19.92 }, // Belo Horizonte
  { longitude: -49.27, latitude: -25.43 }, // Curitiba
  { longitude: -51.23, latitude: -30.03 }, // Porto Alegre
  { longitude: -47.88, latitude: -15.79 }, // Brasília
  { longitude: -34.88, latitude: -8.05 }, // Recife
  { longitude: -38.54, latitude: -3.73 }, // Fortaleza
  { longitude: -60.02, latitude: -3.1 }, // Manaus
  { longitude: -48.49, latitude: -1.45 } // Belém
];

export function planOvertureSearchAreas(bounds: SearchBounds, national = false, region = ''): OvertureSearchArea[] {
  validateBounds(bounds);
  const areas: OvertureSearchArea[] = [];
  for (let south = bounds.south; south < bounds.north; south += 1) {
    for (let west = bounds.west; west < bounds.east; west += 1) {
      areas.push({
        west, south, east: Math.min(west + 1, bounds.east), north: Math.min(south + 1, bounds.north), depth: 0
      });
    }
  }

  if (!national) {
    const normalizedRegion = normalizeText(region);
    const focus = normalizedRegion.includes('rio de janeiro') ? NATIONAL_FOCUS_POINTS[0]
      : normalizedRegion.includes('sao paulo') ? NATIONAL_FOCUS_POINTS[1]
        : normalizedRegion.includes('bahia') ? NATIONAL_FOCUS_POINTS[2]
          : { longitude: (bounds.west + bounds.east) / 2, latitude: (bounds.south + bounds.north) / 2 };
    return areas.sort((first, second) => areaDistance(first, focus) - areaDistance(second, focus));
  }

  const firstAreas = NATIONAL_FOCUS_POINTS.flatMap((point) => {
    const area = areas.find((candidate) => areaContains(candidate, point));
    return area ? [area] : [];
  });
  const prioritized = [...new Set(firstAreas)];
  const rest = areas.filter((area) => !prioritized.includes(area));
  rest.sort((first, second) => Math.min(...NATIONAL_FOCUS_POINTS.map((point) => areaDistance(first, point)))
    - Math.min(...NATIONAL_FOCUS_POINTS.map((point) => areaDistance(second, point))));
  return [...prioritized, ...rest];
}

export function splitOvertureSearchArea(area: OvertureSearchArea): OvertureSearchArea[] {
  if (area.depth >= 6 || (area.east - area.west <= 0.05 && area.north - area.south <= 0.05)) return [];
  const middleLongitude = (area.west + area.east) / 2;
  const middleLatitude = (area.south + area.north) / 2;
  return [
    { west: area.west, east: middleLongitude, south: area.south, north: middleLatitude, depth: area.depth + 1 },
    { west: middleLongitude, east: area.east, south: area.south, north: middleLatitude, depth: area.depth + 1 },
    { west: area.west, east: middleLongitude, south: middleLatitude, north: area.north, depth: area.depth + 1 },
    { west: middleLongitude, east: area.east, south: middleLatitude, north: area.north, depth: area.depth + 1 }
  ];
}

function areaContains(area: SearchBounds, point: { longitude: number; latitude: number }) {
  return point.longitude >= area.west && point.longitude < area.east
    && point.latitude >= area.south && point.latitude < area.north;
}

function areaDistance(area: SearchBounds, point: { longitude: number; latitude: number }) {
  const longitude = (area.west + area.east) / 2 - point.longitude;
  const latitude = (area.south + area.north) / 2 - point.latitude;
  return longitude * longitude + latitude * latitude;
}

export async function searchOvertureBusinesses(bounds: SearchBounds): Promise<ExternalBusiness[]> {
  return (await searchOvertureArea(bounds)).businesses;
}

export async function searchOvertureArea(bounds: SearchBounds): Promise<OvertureAreaResult> {
  const key = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
  const cached = queryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const release = await getLatestRelease();
  const files = (await executeDuckDbQuery(buildStacFileQuery(bounds, release)))
    .map((row) => stringValue(row.url))
    .filter((url): url is string => Boolean(url && isOverturePlaceFile(url, release)));
  if (!files.length) return { businesses: [], hitLimit: false };
  const rows = await executeDuckDbQuery(buildOvertureQuery(bounds, release, files));
  const result = { businesses: normalizeOverturePlaces(rows), hitLimit: rows.length >= MAX_OVERTURE_RESULTS };
  queryCache.set(key, { value: result, expiresAt: Date.now() + QUERY_CACHE_TTL_MS });
  removeExpiredQueries();
  return result;
}

export function normalizeOverturePlaces(rows: OvertureRow[]): ExternalBusiness[] {
  const businesses: ExternalBusiness[] = [];
  const seenIds = new Set<string>();

  for (const row of rows) {
    const id = stringValue(row.id);
    if (!id || seenIds.has(id)) continue;

    const category = stringValue(row.category) || stringValue(row.category_path);
    const name = stringValue(row.name) ?? stringValue(row.brand_name);
    const searchableText = `${category ?? ''} ${name ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!name || !isUsefulPlaceName(name)) continue;
    if (UNRELATED_AUTO_PLACE_PATTERN.test(searchableText)) continue;
    if (!AUTO_SERVICE_PATTERN.test(searchableText)) continue;
    if (stringValue(row.operating_status)?.toLowerCase() === 'permanently_closed') continue;

    seenIds.add(id);
    businesses.push({
      osmId: `overture/${id}`,
      name: name?.trim() || 'Nome comercial não informado',
      phone: stringValue(row.phone),
      website: stringValue(row.website),
      instagram: instagramFromSocials(row.socials),
      whatsapp: null,
      address: stringValue(row.address),
      category: category?.trim() || null,
      latitude: numberValue(row.latitude),
      longitude: numberValue(row.longitude),
      source: 'Overture'
    });
  }

  return businesses;
}

export function mergeBusinessSources(osmBusinesses: ExternalBusiness[], overtureBusinesses: ExternalBusiness[]) {
  const merged = [...osmBusinesses];

  for (const overtureBusiness of overtureBusinesses) {
    const duplicate = merged.find((candidate) => sameNamedPlace(candidate, overtureBusiness));
    if (!duplicate) {
      merged.push(overtureBusiness);
      continue;
    }

    const index = merged.indexOf(duplicate);
    merged[index] = {
      ...duplicate,
      name: isUsefulPlaceName(duplicate.name) ? duplicate.name : overtureBusiness.name,
      phone: duplicate.phone ?? overtureBusiness.phone,
      website: duplicate.website ?? overtureBusiness.website,
      instagram: duplicate.instagram ?? overtureBusiness.instagram,
      whatsapp: duplicate.whatsapp ?? overtureBusiness.whatsapp,
      address: duplicate.address ?? overtureBusiness.address,
      category: duplicate.category && !['yes', 'no'].includes(normalizeText(duplicate.category))
        ? duplicate.category
        : overtureBusiness.category ?? duplicate.category,
      source: 'OpenStreetMap + Overture'
    };
  }

  return merged;
}

export function buildStacFileQuery(bounds: SearchBounds, release: string) {
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release)) throw new Error('Versão de dados Overture inválida.');
  validateBounds(bounds);
  const stacUrl = `https://stac.overturemaps.org/${release}/collections.parquet`;
  return `
    SELECT assets.aws.alternate.s3.href AS url
    FROM read_parquet('${stacUrl}')
    WHERE assets.aws.alternate.s3.href LIKE '%/theme=places/type=place/%'
      AND bbox.xmin <= ${bounds.east}
      AND bbox.xmax >= ${bounds.west}
      AND bbox.ymin <= ${bounds.north}
      AND bbox.ymax >= ${bounds.south}
  `;
}

export function buildOvertureQuery(bounds: SearchBounds, release: string, files: string[]) {
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release)) throw new Error('Versão de dados Overture inválida.');
  validateBounds(bounds);
  if (!files.length || files.some((file) => !isOverturePlaceFile(file, release))) {
    throw new Error('Índice STAC retornou arquivos Overture inválidos.');
  }

  const placesPaths = `[${files.map((file) => `'${file.replaceAll("'", "''")}'`).join(', ')}]`;
  const automotivePattern = AUTO_SERVICE_PATTERN.source.replaceAll("'", "''");
  return `
    SELECT
      id,
      coalesce(names.primary, brand.names.primary) AS name,
      coalesce(taxonomy.primary, basic_category) AS category,
      addresses[1].freeform AS address,
      phones[1] AS phone,
      websites[1] AS website,
      array_to_string(socials, ' ') AS socials,
      ST_Y(geometry) AS latitude,
      ST_X(geometry) AS longitude,
      operating_status
    FROM read_parquet(${placesPaths}, filename = true, hive_partitioning = 1)
    WHERE bbox.xmin BETWEEN ${bounds.west} AND ${bounds.east}
      AND bbox.ymin BETWEEN ${bounds.south} AND ${bounds.north}
      AND operating_status IS DISTINCT FROM 'permanently_closed'
      AND regexp_matches(translate(lower(concat_ws(' ', coalesce(taxonomy.primary, ''), coalesce(basic_category, ''), coalesce(names.primary, ''), coalesce(brand.names.primary, ''))), 'áàâãéêíóôõúç', 'aaaaeeiooouc'), '${automotivePattern}')
    LIMIT ${MAX_OVERTURE_RESULTS}
  `;
}

function isOverturePlaceFile(url: string, release: string) {
  return url.startsWith(`s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/`)
    && url.endsWith('.parquet');
}

function sameNamedPlace(first: ExternalBusiness, second: ExternalBusiness) {
  const firstName = normalizeText(first.name);
  const secondName = normalizeText(second.name);
  if (typeof first.latitude === 'number' && typeof first.longitude === 'number'
    && typeof second.latitude === 'number' && typeof second.longitude === 'number') {
    const distance = distanceMeters(first.latitude, first.longitude, second.latitude, second.longitude);
    if (!isUsefulPlaceName(first.name) || !isUsefulPlaceName(second.name)) return distance <= 15;
    return firstName === secondName && distance <= 60;
  }
  return isUsefulPlaceName(first.name) && isUsefulPlaceName(second.name) && firstName === secondName
    && Boolean(first.address && second.address && normalizeText(first.address) === normalizeText(second.address));
}

function isUsefulPlaceName(name: string) {
  return Boolean(name.trim())
    && !['nome comercial nao informado', 'yes', 'no'].includes(normalizeText(name))
    && !isGenericBusinessName(name);
}

function distanceMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function instagramFromSocials(value: unknown) {
  const socials = stringValue(value);
  return socials?.match(INSTAGRAM_URL)?.[0] ?? null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateBounds(bounds: SearchBounds) {
  const values = [bounds.west, bounds.south, bounds.east, bounds.north];
  if (values.some((value) => !Number.isFinite(value)) || bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new Error('Área de pesquisa inválida para Overture.');
  }
}

async function getLatestRelease() {
  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) return cachedCatalog.value;

  const response = await fetch(STAC_CATALOG_URL, {
    signal: AbortSignal.timeout(12_000),
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
  });
  if (!response.ok) throw new Error(`Catálogo Overture indisponível (${response.status}).`);

  const catalog = await response.json() as { latest?: unknown };
  if (typeof catalog.latest !== 'string' || !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(catalog.latest)) {
    throw new Error('O catálogo Overture não informou uma versão válida.');
  }

  cachedCatalog = { value: catalog.latest, expiresAt: Date.now() + CATALOG_TTL_MS };
  return catalog.latest;
}

async function executeDuckDbQuery(sql: string): Promise<OvertureRow[]> {
  duckDbPromise ??= DuckDBInstance.fromCache(':memory:', { threads: '2' });
  const instance = await duckDbPromise;
  const connection = await instance.connect();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await connection.run("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';");
    const queryPromise = connection.runAndReadAll(sql);
    const queryTimeout = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        connection.interrupt();
        reject(new Error('A consulta Overture excedeu o tempo limite.'));
      }, OVERTURE_QUERY_TIMEOUT_MS);
    });
    const reader = await Promise.race([queryPromise, queryTimeout]);
    return reader.getRowObjectsJS() as OvertureRow[];
  } finally {
    if (timeout) clearTimeout(timeout);
    connection.closeSync();
  }
}

function removeExpiredQueries() {
  const now = Date.now();
  for (const [key, cached] of queryCache) {
    if (cached.expiresAt <= now) queryCache.delete(key);
  }
  while (queryCache.size > 30) queryCache.delete(queryCache.keys().next().value!);
}
