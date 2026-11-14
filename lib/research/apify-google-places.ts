import type { ExternalBusiness } from '@/lib/osm';

const APIFY_API = 'https://api.apify.com/v2';
const ACTOR_ID = 'compass~crawler-google-places';
const MAX_TOTAL_CHARGE_USD = 0.6;
const MAX_PLACES_PER_SEARCH = 60;
const REQUEST_TIMEOUT_MS = 55_000;

type ApifyRun = {
  id?: string;
  status?: string;
  defaultDatasetId?: string;
};

type ApifyPlace = Record<string, unknown>;

export type ApifySearchRun = { runId: string };
export type ApifySearchStatus =
  | { status: 'RUNNING' | 'READY' | 'TIMING-OUT' | 'ABORTING'; businesses: [] }
  | { status: 'FAILED' | 'ABORTED' | 'TIMED-OUT'; businesses: [] }
  | { status: 'SUCCEEDED'; businesses: ExternalBusiness[] };

/** This provider is deliberately opt-in; missing credentials never affect Overture searches. */
export function isApifyGooglePlacesEnabled() {
  return process.env.APIFY_PROSPECTING_ENABLED === 'true' && Boolean(process.env.APIFY_API_TOKEN?.trim());
}

export async function startApifyGooglePlacesSearch(input: { niche: string; city: string; region: string }) {
  const token = requireApifyToken();
  const locationQuery = `${input.city.trim()}, ${input.region.trim()}, Brazil`.replace(/^,\s*/, '');
  const response = await fetch(buildUrl(`/acts/${ACTOR_ID}/runs`, {
    maxTotalChargeUsd: String(MAX_TOTAL_CHARGE_USD)
  }), {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchStringsArray: [input.niche.trim()],
      locationQuery,
      maxCrawledPlacesPerSearch: MAX_PLACES_PER_SEARCH,
      language: 'pt-BR',
      skipClosedPlaces: true,
      scrapeContacts: true
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Apify não iniciou a busca (HTTP ${response.status}).`);
  const payload = await response.json() as { data?: ApifyRun };
  const runId = payload.data?.id?.trim();
  if (!runId) throw new Error('Apify iniciou a busca sem retornar um identificador de execução.');
  return { runId } satisfies ApifySearchRun;
}

export async function getApifyGooglePlacesSearch(runId: string, input: { city: string; region: string }): Promise<ApifySearchStatus> {
  const safeRunId = runId.trim();
  if (!/^[a-zA-Z0-9_-]{5,100}$/.test(safeRunId)) throw new Error('Identificador de execução Apify inválido.');
  const token = requireApifyToken();
  const response = await fetch(buildUrl(`/actor-runs/${encodeURIComponent(safeRunId)}`, { waitForFinish: '45' }), {
    headers: authHeaders(token),
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Apify não retornou o status da busca (HTTP ${response.status}).`);
  const payload = await response.json() as { data?: ApifyRun };
  const run = payload.data;
  if (!run?.status) throw new Error('Apify retornou um status de execução vazio.');
  if (run.status !== 'SUCCEEDED') {
    if (['RUNNING', 'READY', 'TIMING-OUT', 'ABORTING'].includes(run.status)) {
      return { status: run.status as 'RUNNING' | 'READY' | 'TIMING-OUT' | 'ABORTING', businesses: [] };
    }
    return { status: run.status as 'FAILED' | 'ABORTED' | 'TIMED-OUT', businesses: [] };
  }
  if (!run.defaultDatasetId) return { status: 'SUCCEEDED', businesses: [] };

  const fields = [
    'title', 'categoryName', 'website', 'domain', 'phone', 'totalScore', 'reviewsCount', 'placeId', 'url',
    'neighborhood', 'address', 'imageUrl', 'images', 'imageUrls', 'location', 'latitude', 'longitude'
  ].join(',');
  const datasetResponse = await fetch(buildUrl(`/datasets/${encodeURIComponent(run.defaultDatasetId)}/items`, {
    clean: 'true',
    limit: String(MAX_PLACES_PER_SEARCH),
    fields
  }), { headers: authHeaders(token), cache: 'no-store', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!datasetResponse.ok) throw new Error(`Apify não retornou os resultados da busca (HTTP ${datasetResponse.status}).`);
  const rows = await datasetResponse.json() as unknown;
  const businesses = Array.isArray(rows)
    ? rows.map((row) => normalizeApifyPlace(row, input)).filter((row): row is ExternalBusiness => row !== null)
    : [];
  return { status: 'SUCCEEDED', businesses };
}

function normalizeApifyPlace(value: unknown, input: { city: string; region: string }): ExternalBusiness | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as ApifyPlace;
  const name = text(row.title, 180);
  const placeId = text(row.placeId, 240);
  if (!name || !placeId) return null;

  const fallbackAddress = [text(row.neighborhood, 120), input.city.trim(), input.region.trim()].filter(Boolean).join(', ');
  const address = text(row.address, 450) ?? (fallbackAddress || null);
  const location = row.location && typeof row.location === 'object' && !Array.isArray(row.location)
    ? row.location as Record<string, unknown>
    : {};
  const latitude = finiteNumber(row.latitude) ?? finiteNumber(location.lat) ?? finiteNumber(location.latitude);
  const longitude = finiteNumber(row.longitude) ?? finiteNumber(location.lng) ?? finiteNumber(location.lon) ?? finiteNumber(location.longitude);
  const website = normalizeWebsite(row.website, row.domain);
  const imageUrl = firstImageUrl(row);
  const phone = text(row.phone, 64);
  const category = text(row.categoryName, 160);

  return {
    osmId: `apify/${placeId}`,
    name,
    phone,
    website,
    instagram: null,
    // A published Maps phone is not proof that the number accepts WhatsApp.
    whatsapp: null,
    address,
    category,
    latitude,
    longitude,
    imageUrl,
    googleMapsUrl: safeHttpUrl(row.url),
    source: 'Google Maps (Apify)'
  };
}

function normalizeWebsite(website: unknown, domain: unknown) {
  const direct = safeHttpUrl(website);
  if (direct) return direct;
  const host = text(domain, 250);
  if (!host || /[\s/@?#]/.test(host)) return null;
  return safeHttpUrl(`https://${host}`);
}

function safeHttpUrl(value: unknown) {
  const candidate = text(value, 1000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstImageUrl(row: ApifyPlace) {
  const direct = safeHttpUrl(row.imageUrl);
  if (direct) return direct;
  const imageUrls = Array.isArray(row.imageUrls) ? row.imageUrls : Array.isArray(row.images) ? row.images : [];
  for (const image of imageUrls) {
    const url = safeHttpUrl(typeof image === 'string' ? image : image && typeof image === 'object' ? (image as Record<string, unknown>).url : null);
    if (url) return url;
  }
  return null;
}

function text(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function finiteNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function requireApifyToken() {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) throw new Error('Credencial Apify não configurada no servidor.');
  return token;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function buildUrl(path: string, params: Record<string, string>) {
  const url = new URL(`${APIFY_API}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}
