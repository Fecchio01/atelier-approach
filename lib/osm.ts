import { enrichFromOfficialWebsite } from './prospect-enrichment';

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'AtelierApproach/1.0 contato@atelier.local';
const MAX_RESULTS = 500;
const NATIONAL_SEARCH_BUDGET_MS = 45_000;
const NATIONAL_REQUEST_TIMEOUT_MS = 8_000;
const NATIONAL_NOMINATIM_TIMEOUT_MS = 8_000;
const NATIONAL_NOMINATIM_TERMS = ['car wash', 'auto repair', 'car detailing', 'auto body shop'];
const CACHE_TTL_MS = 5 * 60_000;
const STATE_AREA_NAMES: Record<string, string> = {
  'Rio de Janeiro, RJ': 'Rio de Janeiro',
  'Bahia, BA': 'Bahia',
  'São Paulo, SP': 'São Paulo'
};
const NATIONAL_STATE_NAMES = [
  'São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Bahia', 'Paraná', 'Rio Grande do Sul', 'Santa Catarina',
  'Pernambuco', 'Ceará', 'Goiás', 'Pará', 'Maranhão', 'Espírito Santo', 'Paraíba', 'Amazonas', 'Mato Grosso',
  'Rio Grande do Norte', 'Alagoas', 'Piauí', 'Distrito Federal', 'Mato Grosso do Sul', 'Sergipe', 'Rondônia',
  'Tocantins', 'Acre', 'Amapá', 'Roraima'
] as const;

export type ExternalBusiness = {
  osmId: string;
  name: string;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp?: string | null;
  address?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
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
  display_name?: string;
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
};

type CachedValue<T> = { expiresAt: number; value: T };

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
  const geocodeCache = new Map<string, CachedValue<{ latitude: number; longitude: number }>>();

  async function searchBusinesses(input: SearchBusinessesInput): Promise<ExternalBusiness[]> {
    const cacheKey = `${normalizeText(input.niche)}|${normalizeText(input.region)}|${normalizeText(input.city ?? '')}|${input.national ? 'national' : input.radiusKm}`;
    const cached = getCached(searchCache, cacheKey);
    if (cached) return cached;

    if (input.national) {
      const businesses = await searchNationalBusinesses(input);
      setCached(searchCache, cacheKey, businesses);
      return businesses;
    }

    const areaName = input.national ? null : input.city ? stripPlaceSuffix(input.city) : STATE_AREA_NAMES[input.region] ?? null;
    const areaLevel = input.city ? '8' : '4';
    const coordinates = input.national || areaName ? null : await geocodeRegion(input.region);
    const payload = await fetchOverpass(buildOverpassQuery(input, coordinates, areaName, areaLevel));
    if (!Array.isArray(payload.elements)) throw new OsmUnavailableError();

    const normalizedBusinesses = payload.elements.flatMap(normalizeBusiness);
    const relevantBusinesses = isAutomotiveAestheticsNiche(input.niche)
      ? normalizedBusinesses.filter((business) => !isAutomotiveNoise(business.name))
      : normalizedBusinesses;
    const businesses = await enrichBusinesses(dedupeBusinesses(relevantBusinesses));
    setCached(searchCache, cacheKey, businesses);
    return businesses;
  }

  async function searchNationalBusinesses(input: SearchBusinessesInput) {
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
          buildNationalAutomotiveSelectors()
        ), NATIONAL_REQUEST_TIMEOUT_MS);
        successfulAreas += 1;
        candidates.push(...(payload.elements ?? []).flatMap(normalizeBusiness));
      } catch {
        // A single state's area can fail or time out without invalidating the national search.
        if (!fallbackAttempted && candidates.length === 0) {
          fallbackAttempted = true;
          const fallbackBusinesses = await searchNationalViaNominatim();
          if (fallbackBusinesses.length) return fallbackBusinesses;
        }
      }

      if (candidates.length >= MAX_RESULTS) break;
    }

    if (!successfulAreas) {
      if (!fallbackAttempted) {
        fallbackAttempted = true;
        const fallbackBusinesses = await searchNationalViaNominatim();
        if (fallbackBusinesses.length) return fallbackBusinesses;
      }
      throw new OsmUnavailableError();
    }

    const relevantBusinesses = candidates.filter((business) => !isAutomotiveNoise(business.name));
    return enrichBusinesses(dedupeBusinesses(relevantBusinesses).slice(0, MAX_RESULTS));
  }

  async function searchNationalViaNominatim() {
    const candidates: ExternalBusiness[] = [];

    for (const term of NATIONAL_NOMINATIM_TERMS) {
      if (candidates.length >= MAX_RESULTS) break;

      try {
        const params = new URLSearchParams({
          format: 'jsonv2',
          limit: '50',
          countrycodes: 'br',
          addressdetails: '1',
          extratags: '1',
          q: `${term}, Brazil`
        });
        const response = await scheduler.schedule(() => fetch(`${NOMINATIM_URL}?${params}`, {
          signal: AbortSignal.timeout(NATIONAL_NOMINATIM_TIMEOUT_MS),
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
        }));
        if (!response.ok) continue;

        const payload = (await response.json()) as NominatimPlace[];
        if (Array.isArray(payload)) candidates.push(...payload.flatMap(normalizeNominatimBusiness));
      } catch {
        // Continue with the next automotive term; Nominatim is only a fallback.
      }
    }

    return dedupeBusinesses(candidates.filter((business) => !isAutomotiveNoise(business.name))).slice(0, MAX_RESULTS);
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

  async function geocodeRegion(region: string) {
    const cacheKey = normalizeText(region);
    const cached = getCached(geocodeCache, cacheKey);
    if (cached) return cached;

    let response: Response;
    try {
      const params = new URLSearchParams({ format: 'jsonv2', limit: '1', q: region.trim() });
      response = await scheduler.schedule(() => fetch(`${NOMINATIM_URL}?${params}`, {
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
      }));
    } catch {
      throw new OsmUnavailableError();
    }
    if (!response.ok) throw new OsmUnavailableError();

    let places: Array<{ lat?: string; lon?: string }>;
    try {
      places = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    } catch {
      throw new OsmUnavailableError();
    }
    const latitude = Number(places[0]?.lat);
    const longitude = Number(places[0]?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new OsmUnavailableError();

    const coordinates = { latitude, longitude };
    setCached(geocodeCache, cacheKey, coordinates);
    return coordinates;
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

  return { searchBusinesses };
}

async function enrichBusinesses(businesses: ExternalBusiness[]) {
  const enriched: ExternalBusiness[] = [];
  for (let index = 0; index < businesses.length; index += 3) {
    const batch = await Promise.all(businesses.slice(index, index + 3).map(async (business) => {
      if (!business.website) return business;
      const contacts = await enrichFromOfficialWebsite(business.website);
      return {
        ...business,
        phone: business.phone ?? contacts.phone,
        whatsapp: business.whatsapp ?? contacts.whatsapp,
        instagram: business.instagram ?? contacts.instagram,
        website: business.website ?? contacts.website,
        imageUrl: contacts.imageUrl ?? business.imageUrl
      };
    }));
    enriched.push(...batch);
  }
  return enriched;
}

const defaultSearchService = createOsmSearchService();

export const searchBusinesses = defaultSearchService.searchBusinesses;

function buildOverpassQuery(
  input: SearchBusinessesInput,
  coordinates: { latitude: number; longitude: number } | null,
  areaName: string | null,
  areaLevel: string,
  selectorOverride?: string
) {
  const radiusMeters = Math.round(input.radiusKm * 1_000);
  const around = coordinates
    ? `(around:${radiusMeters},${coordinates.latitude},${coordinates.longitude})`
    : areaName ? '(area.region)' : '(area.br)';
  const mappedTags = mappedOsmTags(input.niche);
  const selector = selectorOverride
    ? appendAround(selectorOverride, around)
    : isAutomotiveAestheticsNiche(input.niche)
    ? appendAround(buildAutomotiveAestheticsSelectors(true), around)
    : mappedTags.length
    ? mappedTags.map((tag) => `nwr["${tag.key}"="${tag.value}"]${around};`).join('\n  ')
    : buildTextSelectors(escapeOverpassRegex(input.niche.trim()), around);
  const area = input.national && !areaName
    ? 'area["ISO3166-1"="BR"][admin_level=2]->.br;\n'
    : areaName
      ? `area["name"="${escapeOverpassRegex(areaName)}"]["boundary"="administrative"]["admin_level"="${areaLevel}"]->.region;\n`
      : '';
  return `[out:json][timeout:25];\n${area}(\n  ${selector}\n);\nout center tags ${MAX_RESULTS};`;
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
    'nwr["amenity"="car_wash"]',
    'nwr["service:vehicle:car_wash"="yes"]',
    'nwr["shop"="car_repair"]',
    'nwr["shop"="tyres"]',
    'nwr["craft"="car_painter"]',
    'nwr["craft"="car_repair"]',
    'nwr["craft"="car_detailing"]'
  ].join('\n  ');
}

function appendAround(selectors: string, around: string) {
  return selectors.split('\n').map((selector) => `${selector.trim()}${around};`).join('\n  ');
}

function stripPlaceSuffix(place: string) {
  return place.replace(/,\s*[A-Z]{2}$/u, '').trim();
}

function dedupeBusinesses(businesses: ExternalBusiness[]) {
  return [...new Map(businesses.map((business) => [business.osmId, business])).values()];
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
  const name = element.tags?.name?.trim();
  if (!name) return [];
  return [{
    osmId: `${element.type}/${element.id}`,
    name,
    phone: contactValue(element.tags, 'phone'),
    website: contactValue(element.tags, 'website'),
    instagram: contactValue(element.tags, 'instagram'),
    whatsapp: contactValue(element.tags, 'whatsapp'),
    imageUrl: element.tags?.image?.trim() || null,
    address: addressValue(element.tags),
    category: categoryValue(element.tags),
    latitude: coordinateValue(element.lat ?? element.center?.lat),
    longitude: coordinateValue(element.lon ?? element.center?.lon),
    lastSyncedAt: element.timestamp ?? null
  }];
}

function normalizeNominatimBusiness(place: NominatimPlace): ExternalBusiness[] {
  const name = place.name?.trim() || place.display_name?.split(',')[0]?.trim();
  const osmType = place.osm_type?.trim();
  const osmId = place.osm_id === undefined ? null : String(place.osm_id);
  if (!name || !osmType || !osmId) return [];

  const tags = place.extratags;
  return [{
    osmId: `${osmType}/${osmId}`,
    name,
    phone: contactValue(tags, 'phone'),
    website: contactValue(tags, 'website'),
    instagram: contactValue(tags, 'instagram'),
    whatsapp: contactValue(tags, 'whatsapp'),
    address: place.display_name?.trim() || null,
    category: place.extratags?.amenity || place.extratags?.shop || place.extratags?.craft || null,
    latitude: coordinateValue(Number(place.lat)),
    longitude: coordinateValue(Number(place.lon)),
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

function categoryValue(tags: Record<string, string | undefined> | undefined) {
  return tags?.amenity?.trim() || tags?.shop?.trim() || tags?.craft?.trim() || null;
}

function contactValue(tags: Record<string, string | undefined> | undefined, key: string) {
  return tags?.[key]?.trim() || tags?.[`contact:${key}`]?.trim() || null;
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function escapeOverpassRegex(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
