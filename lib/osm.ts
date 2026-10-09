import { enrichFromOfficialWebsite } from './prospect-enrichment';

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_LOOKUP_URL = 'https://nominatim.openstreetmap.org/lookup';
const USER_AGENT = 'AtelierApproach/1.0 contato@atelier.local';
const MAX_RESULTS = 1_000;
const NATIONAL_MAX_RESULTS = 5_000;
const NATIONAL_SUPPLEMENT_THRESHOLD = 500;
const NATIONAL_SEARCH_BUDGET_MS = 60_000;
const NATIONAL_REQUEST_TIMEOUT_MS = 8_000;
const NATIONAL_NOMINATIM_TIMEOUT_MS = 8_000;
const PROGRESSIVE_OVERPASS_TIMEOUT_MS = 3_000;
const PROGRESSIVE_BATCH_MIN_RESULTS = 5;
const PROGRESSIVE_MAX_REGIONAL_UNITS_PER_BATCH = 5;
const MAX_WEBSITE_ENRICHMENTS_PER_BATCH = 10;
const WEBSITE_ENRICHMENT_CONCURRENCY = 5;
const NATIONAL_NOMINATIM_LOCATIONS = ['São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Bahia'] as const;
const NATIONAL_NOMINATIM_TERMS = [
  'car wash',
  'auto repair',
  'oficina mecânica',
  'estética automotiva',
  'car detailing'
] as const;
const REGIONAL_NOMINATIM_TERMS = [
  'car wash', 'auto repair', 'oficina mecânica', 'estética automotiva', 'car detailing',
  'lavagem automotiva', 'lava jato', 'lava rápido', 'detalhamento automotivo', 'polimento automotivo',
  'cristalização automotiva', 'vitrificação automotiva', 'higienização interna automotiva', 'insulfilm automotivo',
  'auto center', 'centro automotivo', 'funilaria', 'martelinho de ouro', 'higienização automotiva',
  'troca de óleo', 'auto elétrica', 'autopeças', 'pneus', 'borracharia'
] as const;
const CACHE_TTL_MS = 5 * 60_000;
const SEARCH_SESSION_TTL_MS = 15 * 60_000;
const NATIONAL_STATE_NAMES = [
  'São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Bahia', 'Paraná', 'Rio Grande do Sul', 'Santa Catarina',
  'Pernambuco', 'Ceará', 'Goiás', 'Pará', 'Maranhão', 'Espírito Santo', 'Paraíba', 'Amazonas', 'Mato Grosso',
  'Rio Grande do Norte', 'Alagoas', 'Piauí', 'Distrito Federal', 'Mato Grosso do Sul', 'Sergipe', 'Rondônia',
  'Tocantins', 'Acre', 'Amapá', 'Roraima'
] as const;
const GENERIC_BUSINESS_NAMES = new Set([
  'auto repair', 'automotive repair', 'auto center', 'centro automotivo', 'oficina',
  'oficina mecanica', 'oficina mecanica automotiva', 'car repair', 'car wash', 'carwash',
  'car detailing', 'detalhamento automotivo', 'detailing automotivo', 'estetica automotiva',
  'higienizacao automotiva', 'lava jato', 'lava rapido', 'lavagem automotiva',
  'polimento automotivo', 'funilaria', 'martelinho de ouro', 'autopecas', 'pneus',
  'borracharia', 'troca de oleo', 'centro de estetica automotiva', 'automotive service',
  'auto service', 'auto detailing', 'automotive detailing', 'tire shop', 'auto parts store'
]);

export type ExternalBusiness = {
  osmId: string;
  name: string;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp?: string | null;
  address?: string | null;
  category?: string | null;
  categoryHierarchy?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: 'OpenStreetMap' | 'Overture' | 'OpenStreetMap + Overture';
  lastSyncedAt?: string | null;
  alreadyWorked?: boolean;
  crmHref?: string | null;
  imageUrl?: string | null;
};

export type SearchBusinessesInput = {
  niche: string;
  region: string;
  city?: string;
  radiusKm: number;
  national?: boolean;
};

export type SearchBounds = { west: number; south: number; east: number; north: number };

const BRAZIL_SEARCH_BOUNDS: SearchBounds = { west: -73.99, south: -33.75, east: -34.79, north: 5.27 };

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  timestamp?: string;
  tags?: Record<string, string | undefined>;
};

type OverpassResponse = { elements?: OverpassElement[] };

type NominatimPlace = {
  osm_type?: string;
  osm_id?: number | string;
  name?: string;
  type?: string;
  class?: string;
  display_name?: string;
  boundingbox?: [string, string, string, string];
  address?: Record<string, string | undefined>;
  namedetails?: Record<string, string | undefined>;
  lat?: string;
  lon?: string;
  extratags?: Record<string, string | undefined>;
};

type SchedulerOptions = {
  minIntervalMs?: number;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
};

type SearchServiceOptions = {
  scheduler?: OsmRequestScheduler;
  now?: () => number;
  cacheTtlMs?: number;
  searchSessions?: Map<string, OsmSearchSession>;
};

type CachedValue<T> = { expiresAt: number; value: T };

type SearchUnit = {
  family: 'structured-tags' | 'name-variants' | 'nominatim';
  query: string;
  fallbackArea: string;
};

type OsmSearchSession = {
  input: SearchBusinessesInput;
  units: SearchUnit[];
  nextUnitIndex: number;
  seenOsmIds: Set<string>;
  seenBusinesses: ExternalBusiness[];
  createdAt: number;
  lastAccessAt: number;
};

type SearchBatch = { businesses: ExternalBusiness[]; hasMore: boolean };

export class OsmUnavailableError extends Error {
  constructor() {
    super('A busca no OpenStreetMap está indisponível no momento. Tente novamente em alguns instantes.');
    this.name = 'OsmUnavailableError';
  }
}

export class OsmRequestScheduler {
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private nextRequestAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: SchedulerOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 1_000;
    this.now = options.now ?? Date.now;
    this.wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  schedule<T>(request: () => Promise<T>): Promise<T> {
    const scheduled = this.queue.then(async () => {
      const delay = Math.max(0, this.nextRequestAt - this.now());
      if (delay > 0) await this.wait(delay);
      this.nextRequestAt = this.now() + this.minIntervalMs;
      return request();
    });
    this.queue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }
}

export function createOsmSearchService(options: SearchServiceOptions = {}) {
  const scheduler = options.scheduler ?? new OsmRequestScheduler();
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? CACHE_TTL_MS;
  const searchCache = new Map<string, CachedValue<ExternalBusiness[]>>();
  const osmNameCache = new Map<string, string | null>();
  const geocodeCache = new Map<string, CachedValue<{ latitude: number; longitude: number; bounds: SearchBounds | null }>>();
  const searchSessions = options.searchSessions ?? new Map<string, OsmSearchSession>();

  async function startSearch(input: SearchBusinessesInput): Promise<SearchBatch & { searchId: string }> {
    removeExpiredSearchSessions();
    const timestamp = now();
    const searchId = createSearchId();
    const session: OsmSearchSession = {
      input,
      units: await buildSearchUnits(input),
      nextUnitIndex: 0,
      seenOsmIds: new Set(),
      seenBusinesses: [],
      createdAt: timestamp,
      lastAccessAt: timestamp
    };
    searchSessions.set(searchId, session);
    return { searchId, ...(await consumeNextUnit(session)) };
  }

  async function continueSearch(searchId: string): Promise<SearchBatch> {
    removeExpiredSearchSessions();
    const session = searchSessions.get(searchId);
    if (!session) throw new OsmSearchSessionExpiredError();
    return consumeNextUnit(session);
  }

  function removeExpiredSearchSessions() {
    const timestamp = now();
    for (const [searchId, session] of searchSessions) {
      if (timestamp - session.lastAccessAt >= SEARCH_SESSION_TTL_MS) searchSessions.delete(searchId);
    }
  }

  async function buildSearchUnits(input: SearchBusinessesInput): Promise<SearchUnit[]> {
    const selectors = searchUnitSelectors(input);
    if (input.national) {
      return NATIONAL_STATE_NAMES.flatMap((stateName) => selectors.map(({ family, selector }) => ({
        family,
        fallbackArea: stateName,
        query: buildOverpassQuery(input, null, stateName, '4', selector, 1_000)
      })));
    }

    const stateAreaName = brazilianStateAreaName(input.region);
    const areaName = input.city ? stripPlaceSuffix(input.city) : stateAreaName;
    const areaLevel = input.city ? '8' : '4';
    const fallbackArea = input.city
      ? `${stripPlaceSuffix(input.city)}, ${stateAreaName ?? stripPlaceSuffix(input.region)}`
      : areaName ?? input.region;
    const coordinates = areaName ? null : await geocodeRegion(input.region);
    const overpassUnits = selectors.map(({ family, selector }) => ({
      family,
      fallbackArea,
      query: buildOverpassQuery(input, coordinates, areaName, areaLevel, selector)
    }));
    if (!isAutomotiveAestheticsNiche(input.niche)) return overpassUnits;

    // Overpass gives a complete snapshot for a state, but it cannot page that
    // snapshot. Add independent Nominatim term queries so regional searches can
    // progressively discover candidates beyond the first Overpass result set.
    return [
      ...overpassUnits,
      ...REGIONAL_NOMINATIM_TERMS.map((term) => ({
        family: 'nominatim' as const,
        fallbackArea,
        query: term
      }))
    ];
  }

  async function consumeNextUnit(session: OsmSearchSession): Promise<SearchBatch> {
    session.lastAccessAt = now();
    const businesses: ExternalBusiness[] = [];
    let processedUnits = 0;
    while (session.nextUnitIndex < session.units.length) {
      if (!session.input.national && processedUnits >= PROGRESSIVE_MAX_REGIONAL_UNITS_PER_BATCH) break;
      const unit = session.units[session.nextUnitIndex++];
      processedUnits += 1;

      if (unit.family === 'nominatim') {
        const candidates = await searchNominatimForArea(session.input, unit.fallbackArea, unit.query);
        const unseen = takeUnseenBusinesses(session, candidates);
        if (unseen.length) businesses.push(...unseen);
        if (businesses.length >= PROGRESSIVE_BATCH_MIN_RESULTS) break;
        continue;
      }

      try {
        const payload = await fetchOverpass(unit.query, PROGRESSIVE_OVERPASS_TIMEOUT_MS);
        const normalized = (payload.elements ?? []).flatMap(normalizeBusiness);
        const relevant = isAutomotiveAestheticsNiche(session.input.niche)
          ? normalized.filter((business) => !isAutomotiveNoise(business.name))
          : normalized;
        const unseen = takeUnseenBusinesses(session, relevant);
        if (unseen.length) {
          businesses.push(...unseen);
        }
      } catch {
        const fallbackBusinesses = await searchNominatimForArea(session.input, unit.fallbackArea);
        const unseenFallbackBusinesses = takeUnseenBusinesses(session, fallbackBusinesses);
        if (unseenFallbackBusinesses.length) {
          skipRemainingOverpassUnitsForArea(session, unit.fallbackArea);
          businesses.push(...unseenFallbackBusinesses);
        }
      }

      if (businesses.length >= PROGRESSIVE_BATCH_MIN_RESULTS) break;
    }

    return {
      businesses: await enrichBusinesses(businesses, scheduler, osmNameCache),
      hasMore: session.nextUnitIndex < session.units.length
    };
  }

  async function searchBusinesses(input: SearchBusinessesInput): Promise<ExternalBusiness[]> {
    const cacheKey = `${normalizeText(input.niche)}|${normalizeText(input.region)}|${normalizeText(input.city ?? '')}|${input.national ? 'national' : input.radiusKm}`;
    const cached = getCached(searchCache, cacheKey);
    if (cached) return cached;

    if (input.national) {
      const businesses = await searchNationalBusinesses(input, scheduler, osmNameCache);
      setCached(searchCache, cacheKey, businesses);
      return businesses;
    }

    const stateAreaName = brazilianStateAreaName(input.region);
    const areaName = input.national ? null : input.city ? stripPlaceSuffix(input.city) : stateAreaName;
    const areaLevel = input.city ? '8' : '4';
    const coordinates = input.national || areaName ? null : await geocodeRegion(input.region);
    const payload = await fetchOverpass(buildOverpassQuery(input, coordinates, areaName, areaLevel));
    if (!Array.isArray(payload.elements)) throw new OsmUnavailableError();

    const normalizedBusinesses = payload.elements.flatMap(normalizeBusiness);
    const relevantBusinesses = isAutomotiveAestheticsNiche(input.niche)
      ? normalizedBusinesses.filter((business) => !isAutomotiveNoise(business.name))
      : normalizedBusinesses;
    const businesses = await enrichBusinesses(dedupeBusinesses(relevantBusinesses), scheduler, osmNameCache);
    setCached(searchCache, cacheKey, businesses);
    return businesses;
  }

  async function searchNationalBusinesses(input: SearchBusinessesInput, requestScheduler: OsmRequestScheduler, nameCache: Map<string, string | null>) {
    const candidates: ExternalBusiness[] = [];
    let successfulAreas = 0;
    let fallbackAttempted = false;
    const deadline = Date.now() + NATIONAL_SEARCH_BUDGET_MS;

    for (const stateName of NATIONAL_STATE_NAMES) {
      if (Date.now() >= deadline) break;
      try {
        const payload = await fetchOverpass(buildOverpassQuery(
          input,
          null,
          stateName,
          '4',
          buildNationalAutomotiveSelectors(),
          1_000
        ), NATIONAL_REQUEST_TIMEOUT_MS);
        successfulAreas += 1;
        candidates.push(...(payload.elements ?? []).flatMap(normalizeBusiness));
      } catch {
        // A single state's area can fail or time out without invalidating the national search.
        if (!fallbackAttempted && candidates.length === 0) {
          fallbackAttempted = true;
          const fallbackBusinesses = await searchNationalViaNominatim();
          if (fallbackBusinesses.length) return fallbackBusinesses;
          return [];
        }
      }

      if (candidates.length >= NATIONAL_MAX_RESULTS) break;
    }

    if (!successfulAreas) {
      if (!fallbackAttempted) {
        fallbackAttempted = true;
        const fallbackBusinesses = await searchNationalViaNominatim();
        if (fallbackBusinesses.length) return fallbackBusinesses;
      }
      return [];
    }

    let relevantBusinesses = dedupeBusinesses(candidates.filter((business) => !isAutomotiveNoise(business.name)));
    if (relevantBusinesses.length < NATIONAL_SUPPLEMENT_THRESHOLD) {
      const supplementalBusinesses = await searchNationalViaNominatim();
      relevantBusinesses = dedupeBusinesses([...relevantBusinesses, ...supplementalBusinesses]);
    }
    return enrichBusinesses(relevantBusinesses.slice(0, NATIONAL_MAX_RESULTS), requestScheduler, nameCache);
  }

  async function searchNationalViaNominatim() {
    const candidates: ExternalBusiness[] = [];

    for (const location of NATIONAL_NOMINATIM_LOCATIONS) {
      for (const term of NATIONAL_NOMINATIM_TERMS) {
        if (candidates.length >= NATIONAL_MAX_RESULTS) break;

        try {
          const params = new URLSearchParams({
            format: 'jsonv2',
            limit: '40',
            countrycodes: 'br',
            addressdetails: '1',
            extratags: '1',
            namedetails: '1',
            q: `${term}, ${location}, Brazil`
          });
          const response = await scheduler.schedule(() => fetch(`${NOMINATIM_URL}?${params}`, {
            signal: AbortSignal.timeout(NATIONAL_NOMINATIM_TIMEOUT_MS),
            headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
          }));
          if (response.status === 429) return [];
          if (!response.ok) continue;

          const payload = (await response.json()) as NominatimPlace[];
          if (Array.isArray(payload)) candidates.push(...payload.flatMap(normalizeNominatimBusiness));
        } catch {
          // Continue with the next automotive term; Nominatim is only a fallback.
        }
      }
    }

    return dedupeBusinesses(candidates.filter((business) => !isAutomotiveNoise(business.name))).slice(0, NATIONAL_MAX_RESULTS);
  }

  async function searchNominatimForArea(input: SearchBusinessesInput, areaName: string, requestedTerm?: string) {
    const candidates: ExternalBusiness[] = [];
    const terms = requestedTerm
      ? [requestedTerm]
      : isAutomotiveAestheticsNiche(input.niche) ? NATIONAL_NOMINATIM_TERMS : [input.niche];

    for (const term of terms) {
      try {
        const params = new URLSearchParams({
          format: 'jsonv2',
          limit: '40',
          countrycodes: 'br',
          addressdetails: '1',
          extratags: '1',
          namedetails: '1',
          q: `${term}, ${areaName}, Brazil`
        });
        const response = await scheduler.schedule(() => fetch(`${NOMINATIM_URL}?${params}`, {
          signal: AbortSignal.timeout(NATIONAL_NOMINATIM_TIMEOUT_MS),
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
        }));
        if (response.status === 429) return [];
        if (!response.ok) continue;

        const payload = (await response.json()) as NominatimPlace[];
        if (Array.isArray(payload)) {
          candidates.push(...payload.flatMap(normalizeNominatimBusiness));
          if (candidates.length) return dedupeBusinesses(candidates.filter((business) => !isAutomotiveNoise(business.name)));
        }
      } catch {
        // Nominatim is a best-effort fallback for this individual failed unit.
      }
    }

    return dedupeBusinesses(candidates.filter((business) => !isAutomotiveNoise(business.name)));
  }

  async function fetchOverpass(query: string, timeoutMs = 12_000): Promise<OverpassResponse> {
    for (const url of OVERPASS_URLS) {
      try {
        const response = await scheduler.schedule(() => fetch(url, {
          method: 'POST',
          body: query,
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': USER_AGENT }
        }));
        if (!response.ok) continue;

        const payload = (await response.json()) as OverpassResponse;
        if (Array.isArray(payload.elements)) return payload;
      } catch {
        // Try the alternate public Overpass endpoint before surfacing an error.
      }
    }

    throw new OsmUnavailableError();
  }

  async function geocodeRegion(region: string, featureType?: 'city' | 'state') {
    const cacheKey = `${normalizeText(region)}|${featureType ?? ''}`;
    const cached = getCached(geocodeCache, cacheKey);
    if (cached) return cached;

    let response: Response;
    try {
      const params = new URLSearchParams({ format: 'jsonv2', limit: '1', q: region.trim(), countrycodes: 'br' });
      if (featureType) params.set('featuretype', featureType);
      response = await scheduler.schedule(() => fetch(`${NOMINATIM_URL}?${params}`, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
      }));
    } catch {
      throw new OsmUnavailableError();
    }
    if (!response.ok) throw new OsmUnavailableError();

    let places: NominatimPlace[];
    try {
      places = (await response.json()) as NominatimPlace[];
    } catch {
      throw new OsmUnavailableError();
    }
    const latitude = Number(places[0]?.lat);
    const longitude = Number(places[0]?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new OsmUnavailableError();

    const boundingbox = places[0]?.boundingbox;
    const south = Number(boundingbox?.[0]);
    const north = Number(boundingbox?.[1]);
    const west = Number(boundingbox?.[2]);
    const east = Number(boundingbox?.[3]);
    const bounds = [west, south, east, north].every(Number.isFinite) && west < east && south < north
      ? { west, south, east, north }
      : null;
    const coordinates = { latitude, longitude, bounds };
    setCached(geocodeCache, cacheKey, coordinates);
    return coordinates;
  }

  async function resolveSearchBounds(region: string, city?: string, national?: boolean): Promise<SearchBounds | null> {
    if (national) return BRAZIL_SEARCH_BOUNDS;
    const stateName = brazilianStateAreaName(region) ?? stripPlaceSuffix(region);
    const query = city ? `${stripPlaceSuffix(city)}, ${stateName}, Brasil` : `${stateName}, Brasil`;
    const result = await geocodeRegion(query, city ? 'city' : 'state');
    return result.bounds;
  }

  function getCached<T>(cache: Map<string, CachedValue<T>>, key: string) {
    const cached = cache.get(key);
    if (!cached) return null;
    if (cached.expiresAt > now()) return cached.value;
    cache.delete(key);
    return null;
  }

  function setCached<T>(cache: Map<string, CachedValue<T>>, key: string, value: T) {
    cache.set(key, { expiresAt: now() + cacheTtlMs, value });
  }

  return { searchBusinesses, startSearch, continueSearch, resolveSearchBounds };
}

export class OsmSearchSessionExpiredError extends Error {
  constructor() {
    super('Esta sessão de busca expirou. Inicie uma nova busca para continuar.');
    this.name = 'OsmSearchSessionExpiredError';
  }
}

async function enrichBusinesses(
  businesses: ExternalBusiness[],
  scheduler: OsmRequestScheduler,
  nameCache: Map<string, string | null>
) {
  const unnamedBusinesses = businesses.filter((business) => business.name === 'Nome comercial não informado' && !nameCache.has(business.osmId));
  const lookupBatch = unnamedBusinesses.slice(0, 50);
  if (lookupBatch.length) {
    const osmIds = lookupBatch.map((business) => toNominatimOsmId(business.osmId)).filter((id): id is string => Boolean(id));
    if (osmIds.length) {
      try {
        const params = new URLSearchParams({ format: 'jsonv2', osm_ids: osmIds.join(','), namedetails: '1', extratags: '1' });
        const response = await scheduler.schedule(() => fetch(`${NOMINATIM_LOOKUP_URL}?${params}`, {
          signal: AbortSignal.timeout(NATIONAL_NOMINATIM_TIMEOUT_MS),
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
        }));
        if (response.ok) {
          const payload = (await response.json()) as NominatimPlace[];
          const resolvedNames = new Map<string, string>((Array.isArray(payload) ? payload : []).flatMap((place) => {
            const osmType = place.osm_type?.trim();
            const osmId = place.osm_id === undefined ? null : String(place.osm_id);
            if (!osmType || !osmId) return [];
            const name = businessName({ ...place.extratags, ...place.namedetails, name: place.name ?? place.namedetails?.name });
            return name === 'Nome comercial não informado' ? [] : [[`${osmType}/${osmId}`, name] as const];
          }));
          if (nameCache.size + lookupBatch.length > 10_000) nameCache.clear();
          lookupBatch.forEach((business) => nameCache.set(business.osmId, resolvedNames.get(business.osmId) ?? null));
        }
      } catch {
        // Name lookup is an optional enrichment; keep the OSM result if Nominatim is unavailable.
      }
    }
  }

  const namedBusinesses = businesses.map((business) => {
    const resolvedName = nameCache.get(business.osmId);
    return business.name === 'Nome comercial não informado' && resolvedName
      ? { ...business, name: resolvedName }
      : business;
  });
  const candidates = namedBusinesses
    .map((business, index) => ({ business, index }))
    .filter(({ business }) => business.website && (!business.phone || !business.whatsapp || !business.instagram || !business.imageUrl))
    .slice(0, MAX_WEBSITE_ENRICHMENTS_PER_BATCH);
  const enriched = new Map<number, Awaited<ReturnType<typeof enrichFromOfficialWebsite>>>();

  for (let offset = 0; offset < candidates.length; offset += WEBSITE_ENRICHMENT_CONCURRENCY) {
    const chunk = candidates.slice(offset, offset + WEBSITE_ENRICHMENT_CONCURRENCY);
    const results = await Promise.all(chunk.map(({ business }) => enrichFromOfficialWebsite(business.website!)));
    chunk.forEach(({ index }, resultIndex) => enriched.set(index, results[resultIndex]));
  }

  return namedBusinesses.map((business, index) => {
    const websiteData = enriched.get(index);
    if (!websiteData) return business;
    return {
      ...business,
      name: business.name === 'Nome comercial não informado' && websiteData.name && !isGenericBusinessName(websiteData.name)
        ? websiteData.name
        : business.name,
      phone: business.phone ?? websiteData.phone,
      whatsapp: business.whatsapp ?? websiteData.whatsapp,
      instagram: business.instagram ?? websiteData.instagram,
      imageUrl: business.imageUrl ?? websiteData.imageUrl
    };
  });
}

function toNominatimOsmId(osmId: string) {
  const match = /^(node|way|relation)\/(\d+)$/u.exec(osmId);
  if (!match) return null;
  const prefix = match[1] === 'node' ? 'N' : match[1] === 'way' ? 'W' : 'R';
  return `${prefix}${match[2]}`;
}

const defaultSearchService = createOsmSearchService();

export const searchBusinesses = defaultSearchService.searchBusinesses;

function buildOverpassQuery(
  input: SearchBusinessesInput,
  coordinates: { latitude: number; longitude: number } | null,
  areaName: string | null,
  areaLevel: string,
  selectorOverride?: string,
  resultLimit = MAX_RESULTS
) {
  const radiusMeters = Math.round(input.radiusKm * 1_000);
  const around = coordinates
    ? `(around:${radiusMeters},${coordinates.latitude},${coordinates.longitude})`
    : areaName ? '(area.region)' : '(area.br)';
  const mappedTags = mappedOsmTags(input.niche);
  const selector = selectorOverride
    ? appendAround(selectorOverride, around)
    : isAutomotiveAestheticsNiche(input.niche)
    ? appendAround([buildAutomotiveAestheticsSelectors(true), buildAutomotiveNameSelectors()].join('\n'), around)
    : mappedTags.length
    ? mappedTags.map((tag) => `nwr["${tag.key}"="${tag.value}"]${around};`).join('\n  ')
    : buildTextSelectors(escapeOverpassRegex(input.niche.trim()), around);
  const area = input.national && !areaName
    ? 'area["ISO3166-1"="BR"][admin_level=2]->.br;\n'
    : input.city && areaName && stateAreaNameForQuery(input.region)
      ? `area["name"="${escapeOverpassRegex(stateAreaNameForQuery(input.region)!)}"]["boundary"="administrative"]["admin_level"="4"]->.state;\nrel(area.state)["name"="${escapeOverpassRegex(areaName)}"]["boundary"="administrative"];\nmap_to_area->.region;\n`
      : areaName
        ? `area["name"="${escapeOverpassRegex(areaName)}"]["boundary"="administrative"]["admin_level"="${areaLevel}"]->.region;\n`
        : '';
  return `[out:json][timeout:25];\n${area}(\n  ${selector}\n);\nout center tags ${resultLimit};`;
}

function buildAutomotiveAestheticsSelectors(includeRepair = false) {
  const selectors = [
    'nwr["amenity"="car_wash"]',
    'nwr["service:vehicle:car_wash"="yes"]',
    'nwr["shop"="car_repair"]',
    'nwr["shop"="vehicle_repair"]',
    'nwr["shop"="car"]',
    'nwr["shop"="car_parts"]',
    'nwr["shop"="tyres"]',
    'nwr["shop"="vehicle"]',
    'nwr["craft"="car_painter"]',
    'nwr["craft"="car_repair"]',
    'nwr["craft"="vehicle_repair"]',
    'nwr["craft"="car_detailing"]',
    'nwr["service:vehicle:detail"="yes"]',
    'nwr["service:vehicle:repair"="yes"]',
    'nwr["service:vehicle:body_repair"="yes"]',
    'nwr["service:vehicle:tyres"="yes"]',
    'nwr["service:vehicle:oil_change"="yes"]'
  ];
  if (!includeRepair) return selectors.slice(0, 2).join('\n  ');
  return selectors.join('\n  ');
}

function buildNationalAutomotiveSelectors() {
  return [
    buildAutomotiveAestheticsSelectors(true),
    buildAutomotiveNameSelectors()
  ].join('\n  ');
}

function searchUnitSelectors(input: SearchBusinessesInput) {
  const structuredSelector = isAutomotiveAestheticsNiche(input.niche)
    ? buildAutomotiveAestheticsSelectors(true)
    : mappedOsmTags(input.niche).length
      ? mappedOsmTags(input.niche).map((tag) => `nwr["${tag.key}"="${tag.value}"]`).join('\n')
      : [
          `nwr["shop"~"${escapeOverpassRegex(input.niche.trim())}",i]`,
          `nwr["craft"~"${escapeOverpassRegex(input.niche.trim())}",i]`
        ].join('\n');
  const nameSelector = isAutomotiveAestheticsNiche(input.niche)
    ? buildAutomotiveNameSelectors()
    : `nwr["name"~"${escapeOverpassRegex(input.niche.trim())}",i]`;
  return [
    { family: 'structured-tags' as const, selector: structuredSelector },
    { family: 'name-variants' as const, selector: nameSelector }
  ];
}

function createSearchId() {
  return globalThis.crypto?.randomUUID?.() ?? `osm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildAutomotiveNameSelectors() {
  return 'nwr["name"~"est[eé]tica|detalhamento|lavagem|lava.?jato|car.?wash|oficina|mec[aâ]nica|polimento|detailing|higieniza[cç][aã]o|funilaria|martelinho|cristaliza[cç][aã]o|vitrifica[cç][aã]o|insulfilm|pel[ií]cula|auto.?center|auto.?eletrica|auto.?pe[cç]as|auto.?pecas|garage|garagem|lava",i]';
}

function appendAround(selectors: string, around: string) {
  return selectors.split('\n').map((selector) => `${selector.trim()}${around};`).join('\n  ');
}

function stripPlaceSuffix(place: string) {
  return place.replace(/,\s*[A-Z]{2}$/u, '').trim();
}

function brazilianStateAreaName(region: string) {
  const normalizedRegion = normalizeText(stripPlaceSuffix(region));
  return NATIONAL_STATE_NAMES.find((stateName) => normalizeText(stateName) === normalizedRegion) ?? null;
}

function stateAreaNameForQuery(region: string) {
  return brazilianStateAreaName(region);
}

function dedupeBusinesses(businesses: ExternalBusiness[]) {
  const merged = new Map<string, ExternalBusiness>();
  for (const business of businesses) {
    const previous = merged.get(business.osmId) ?? [...merged.values()].find((candidate) => representsSameBusiness(candidate, business));
    if (!previous) {
      merged.set(business.osmId, business);
      continue;
    }
    merged.set(previous.osmId, {
      ...previous,
      ...business,
      osmId: previous.osmId,
      name: hasUsefulBusinessName(previous.name) ? previous.name : business.name,
      phone: business.phone ?? previous.phone,
      website: business.website ?? previous.website,
      instagram: business.instagram ?? previous.instagram,
      whatsapp: business.whatsapp ?? previous.whatsapp,
      address: business.address ?? previous.address,
      category: business.category ?? previous.category,
      latitude: business.latitude ?? previous.latitude,
      longitude: business.longitude ?? previous.longitude,
      lastSyncedAt: business.lastSyncedAt ?? previous.lastSyncedAt,
      imageUrl: business.imageUrl ?? previous.imageUrl
    });
  }
  return [...merged.values()];
}

function representsSameBusiness(first: ExternalBusiness, second: ExternalBusiness) {
  if (!hasUsefulBusinessName(first.name) || !hasUsefulBusinessName(second.name)) return false;
  if (normalizeText(first.name) !== normalizeText(second.name)) return false;
  const firstCoordinates = coordinatesOf(first);
  const secondCoordinates = coordinatesOf(second);
  if (firstCoordinates && secondCoordinates) return distanceMeters(firstCoordinates, secondCoordinates) <= 25;
  return Boolean(first.address && second.address && normalizeText(first.address) === normalizeText(second.address));
}

function coordinatesOf(business: ExternalBusiness) {
  return typeof business.latitude === 'number' && typeof business.longitude === 'number'
    ? { latitude: business.latitude, longitude: business.longitude }
    : null;
}

function distanceMeters(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasUsefulBusinessName(name: string) {
  return name.trim() !== '' && name !== 'Nome comercial não informado' && !isGenericBusinessName(name);
}

function takeUnseenBusinesses(session: OsmSearchSession, businesses: ExternalBusiness[]) {
  return dedupeBusinesses(businesses).filter((business) => {
    if (session.seenOsmIds.has(business.osmId) || session.seenBusinesses.some((seen) => representsSameBusiness(seen, business))) return false;
    session.seenOsmIds.add(business.osmId);
    session.seenBusinesses.push(business);
    return true;
  });
}

function skipRemainingOverpassUnitsForArea(session: OsmSearchSession, fallbackArea: string) {
  while (
    session.units[session.nextUnitIndex]?.fallbackArea === fallbackArea
    && session.units[session.nextUnitIndex]?.family !== 'nominatim'
  ) {
    session.nextUnitIndex += 1;
  }
}

function isAutomotiveAestheticsNiche(niche: string) {
  const normalized = normalizeText(niche);
  return normalized.includes('estetica automotiva') || normalized.includes('lavagem') || normalized.includes('lava jato');
}

function isAutomotiveNoise(name: string) {
  return /rastre|monitoramento|moto\s*-?\s*taxi|\btaxi\b|\bgps\b/i.test(normalizeText(name));
}

function buildTextSelectors(niche: string, around: string) {
  return `nwr["name"~"${niche}",i]${around};\n  nwr["shop"~"${niche}",i]${around};\n  nwr["craft"~"${niche}",i]${around};`;
}

function mappedOsmTags(niche: string) {
  const normalized = normalizeText(niche);
  if (['lavagem', 'lava rapido', 'lava jato', 'estetica automotiva'].some((term) => normalized.includes(term))) {
    return [{ key: 'amenity', value: 'car_wash' }];
  }
  if (['oficina', 'mecanica automotiva', 'reparo automotivo', 'reparacao automotiva'].some((term) => normalized.includes(term))) {
    return [{ key: 'shop', value: 'car_repair' }];
  }
  return [];
}

function normalizeBusiness(element: OverpassElement): ExternalBusiness[] {
  const name = businessName(element.tags);
  return [{
    osmId: `${element.type}/${element.id}`,
    name,
    phone: contactValue(element.tags, 'phone'),
    website: websiteValue(element.tags),
    instagram: contactValue(element.tags, 'instagram'),
    whatsapp: contactValue(element.tags, 'whatsapp'),
    imageUrl: element.tags?.image?.trim() || null,
    address: addressValue(element.tags),
    category: categoryValue(element.tags, element.tags?.name),
    latitude: coordinateValue(element.lat ?? element.center?.lat),
    longitude: coordinateValue(element.lon ?? element.center?.lon),
    source: 'OpenStreetMap',
    lastSyncedAt: element.timestamp ?? null
  }];
}

function normalizeNominatimBusiness(place: NominatimPlace): ExternalBusiness[] {
  const osmType = place.osm_type?.trim();
  const osmId = place.osm_id === undefined ? null : String(place.osm_id);
  if (!osmType || !osmId) return [];

  const tags = { ...place.extratags, ...place.namedetails };
  const name = businessName({ ...tags, name: place.name ?? tags?.name });
  return [{
    osmId: `${osmType}/${osmId}`,
    name,
    phone: contactValue(tags, 'phone'),
    website: websiteValue(tags),
    instagram: contactValue(tags, 'instagram'),
    whatsapp: contactValue(tags, 'whatsapp'),
    address: structuredNominatimAddress(place.address) ?? displayAddressWithoutName(place.display_name, place.name),
    category: categoryValue(tags, place.name, place.type),
    latitude: coordinateValue(Number(place.lat)),
    longitude: coordinateValue(Number(place.lon)),
    source: 'OpenStreetMap',
    lastSyncedAt: null
  }];
}

function coordinateValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function addressValue(tags: Record<string, string | undefined> | undefined) {
  const street = [tags?.['addr:street'], tags?.['addr:housenumber']].filter(Boolean).join(', ');
  const locality = [tags?.['addr:suburb'], tags?.['addr:city'], tags?.['addr:state']].filter(Boolean).join(', ');
  const address = [street, locality, tags?.['addr:postcode']].filter(Boolean).join(', ');
  return address || null;
}

function structuredNominatimAddress(address: NominatimPlace['address']) {
  if (!address) return null;
  const street = [address.road ?? address.pedestrian ?? address.residential, address.house_number].filter(Boolean).join(', ');
  const locality = address.suburb ?? address.neighbourhood ?? address.city_district;
  const city = address.city ?? address.town ?? address.village ?? address.municipality;
  const fields = [street, locality, city, address.state, address.postcode]
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  return fields.length ? fields.join(', ') : null;
}

function displayAddressWithoutName(displayName: string | undefined, name: string | undefined) {
  const parts = displayName?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];
  if (parts.length && name && normalizeText(parts[0]) === normalizeText(name)) parts.shift();
  return parts.join(', ') || displayName?.trim() || null;
}

function businessName(tags: Record<string, string | undefined> | undefined) {
  const candidates = [tags?.['contact:name'], tags?.['name:pt'], tags?.name, tags?.official_name, tags?.short_name, tags?.alt_name, tags?.brand, tags?.operator]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return candidates.find((candidate) => !isGenericBusinessName(candidate)) ?? 'Nome comercial não informado';
}

export function isGenericBusinessName(value: string) {
  const normalized = normalizeText(value).replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return GENERIC_BUSINESS_NAMES.has(normalized);
}

function categoryValue(tags: Record<string, string | undefined> | undefined, name?: string, fallbackType?: string) {
  const meaningfulTag = (value: string | undefined) => value?.trim() && !/^(yes|no)$/i.test(value.trim()) ? value.trim() : null;
  const rawCategory = (tags?.['service:vehicle:car_wash'] === 'yes' ? 'car_wash' : null)
    || meaningfulTag(tags?.amenity) || meaningfulTag(tags?.shop) || meaningfulTag(tags?.craft)
    || meaningfulTag(fallbackType);
  const categories: Record<string, string> = {
    car_wash: 'Lavagem automotiva',
    car_repair: 'Oficina mecânica',
    vehicle_repair: 'Oficina mecânica',
    car_parts: 'Autopeças',
    tyres: 'Pneus e rodas',
    vehicle: 'Acessórios automotivos',
    car_painter: 'Funilaria e pintura automotiva',
    car_detailing: 'Estética automotiva',
    oil_change: 'Troca de óleo'
  };
  if (rawCategory) return categories[rawCategory] ?? rawCategory.replace(/_/g, ' ');
  if (name && isGenericBusinessName(name)) return name;
  return null;
}

function contactValue(tags: Record<string, string | undefined> | undefined, key: string) {
  if (!tags) return null;
  const keys = key === 'phone'
    ? ['phone', 'contact:phone', 'mobile', 'contact:mobile', 'telephone', 'contact:telephone']
    : key === 'instagram'
      ? ['instagram', 'contact:instagram', 'instagram:url', 'contact:instagram:url']
      : key === 'whatsapp'
        ? ['whatsapp', 'contact:whatsapp', 'whatsapp:url', 'contact:whatsapp:url']
        : [key, `contact:${key}`];
  return keys.map((candidate) => tags[candidate]?.trim()).find((value): value is string => Boolean(value)) ?? null;
}

function websiteValue(tags: Record<string, string | undefined> | undefined) {
  const keys = ['website', 'contact:website', 'url', 'contact:url', 'homepage', 'contact:homepage'];
  return keys.map((key) => tags?.[key]?.trim()).find((value): value is string => Boolean(value)) ?? null;
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function escapeOverpassRegex(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
