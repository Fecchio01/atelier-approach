const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
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
  let response: Response;

  try {
    response = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: buildOverpassQuery(input),
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

function buildOverpassQuery(input: { niche: string; region: string; radiusKm: number }) {
  const niche = escapeOverpassRegex(input.niche.trim());
  const region = escapeOverpassString(input.region.trim());
  const resultLimit = input.radiusKm <= 5 ? 25 : MAX_RESULTS;

  return `[out:json][timeout:10];
area["name"="${region}"]["boundary"="administrative"]->.searchArea;
(
  nwr["name"~"${niche}",i](area.searchArea);
  nwr["shop"~"${niche}",i](area.searchArea);
  nwr["craft"~"${niche}",i](area.searchArea);
);
out tags ${resultLimit};`;
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

function escapeOverpassString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeOverpassRegex(value: string) {
  return escapeOverpassString(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
