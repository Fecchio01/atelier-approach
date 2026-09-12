const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'AtelierApproach/1.0 contato@atelier.local';
const MAX_RESULTS = 50;

export type ExternalBusiness = {
  osmId: string;
  name: string;
  phone: string | null;
  website: string | null;
  instagram: string | null;
};

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string | undefined>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

export class OsmUnavailableError extends Error {
  constructor() {
    super('A busca no OpenStreetMap está indisponível no momento. Tente novamente em alguns instantes.');
    this.name = 'OsmUnavailableError';
  }
}

export async function searchBusinesses(input: {
  niche: string;
  region: string;
  radiusKm: number;
}): Promise<ExternalBusiness[]> {
  const coordinates = await geocodeRegion(input.region);
  let response: Response;

  try {
    response = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: buildOverpassQuery(input, coordinates),
      signal: AbortSignal.timeout(12_000),
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'User-Agent': USER_AGENT
      }
    });
  } catch {
    throw new OsmUnavailableError();
  }

  if (!response.ok) {
    throw new OsmUnavailableError();
  }

  let payload: OverpassResponse;
  try {
    payload = (await response.json()) as OverpassResponse;
  } catch {
    throw new OsmUnavailableError();
  }

  if (!Array.isArray(payload.elements)) {
    throw new OsmUnavailableError();
  }

  return payload.elements.flatMap(normalizeBusiness);
}

async function geocodeRegion(region: string) {
  let response: Response;

  try {
    const params = new URLSearchParams({ format: 'jsonv2', limit: '1', q: region.trim() });
    response = await fetch(`${NOMINATIM_URL}?${params}`, {
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
    });
  } catch {
    throw new OsmUnavailableError();
  }

  if (!response.ok) {
    throw new OsmUnavailableError();
  }

  let places: Array<{ lat?: string; lon?: string }>;
  try {
    places = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  } catch {
    throw new OsmUnavailableError();
  }

  const place = places[0];
  const latitude = Number(place?.lat);
  const longitude = Number(place?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new OsmUnavailableError();
  }

  return { latitude, longitude };
}

function buildOverpassQuery(
  input: { niche: string; region: string; radiusKm: number },
  coordinates: { latitude: number; longitude: number }
) {
  const niche = escapeOverpassRegex(input.niche.trim());
  const radiusMeters = Math.round(input.radiusKm * 1_000);

  return `[out:json][timeout:10];
(
  nwr["name"~"${niche}",i](around:${radiusMeters},${coordinates.latitude},${coordinates.longitude});
  nwr["shop"~"${niche}",i](around:${radiusMeters},${coordinates.latitude},${coordinates.longitude});
  nwr["craft"~"${niche}",i](around:${radiusMeters},${coordinates.latitude},${coordinates.longitude});
);
out tags ${MAX_RESULTS};`;
}

function normalizeBusiness(element: OverpassElement): ExternalBusiness[] {
  const name = element.tags?.name?.trim();
  if (!name) {
    return [];
  }

  return [
    {
      osmId: `${element.type}/${element.id}`,
      name,
      phone: contactValue(element.tags, 'phone'),
      website: contactValue(element.tags, 'website'),
      instagram: contactValue(element.tags, 'instagram')
    }
  ];
}

function contactValue(tags: Record<string, string | undefined> | undefined, key: string) {
  return tags?.[key]?.trim() || tags?.[`contact:${key}`]?.trim() || null;
}

function escapeOverpassRegex(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
