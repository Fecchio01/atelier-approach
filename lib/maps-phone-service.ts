import { matchMapsPhoneCandidate, type MapsPhoneCandidate, type MapsPhoneLookupInput } from './maps-phone-lookup';

const UNAVAILABLE_MESSAGE = 'Não foi possível consultar o telefone agora.';
const MAX_TIMEOUT_MS = 45_000;
const BRAZIL_REGIONS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const GEOGRAPHIC_DDDS = new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasControlCharacters(value: string) {
  return Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !hasControlCharacters(value);
}

export function parseMapsPhoneLookupInput(value: unknown): MapsPhoneLookupInput | null {
  if (!object(value) || !text(value.name, 300) || !text(value.city, 150) ||
    !text(value.region, 2) || !BRAZIL_REGIONS.has(value.region.toUpperCase()) ||
    (value.address !== undefined && value.address !== null && !text(value.address, 500))) return null;
  return {
    name: value.name.trim(), city: value.city.trim(), region: value.region.toUpperCase(),
    ...(value.address !== undefined ? { address: value.address === null ? null : (value.address as string).trim() } : {})
  };
}

function parseCandidates(value: unknown): MapsPhoneCandidate[] {
  if (!object(value) || !Array.isArray(value.candidates) || value.candidates.length > 5) throw new Error(UNAVAILABLE_MESSAGE);
  return value.candidates.map((candidate: unknown) => {
    if (!object(candidate) || !text(candidate.name, 300) ||
      !(candidate.phone === null || (typeof candidate.phone === 'string' &&
        /^\+55\d{2}(?:[2-5]\d{7}|9\d{8})$/.test(candidate.phone) && GEOGRAPHIC_DDDS.has(candidate.phone.slice(3, 5)))) ||
      !nullableText(candidate.address, 500) || !nullableText(candidate.city, 150) || !nullableText(candidate.region, 50)) {
      throw new Error(UNAVAILABLE_MESSAGE);
    }
    // Construct a fresh object so provider-only fields can never escape.
    return { name: candidate.name, phone: candidate.phone, address: candidate.address, city: candidate.city, region: candidate.region };
  });
}

function nullableText(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= max && !hasControlCharacters(value));
}

// This module is used only by the server route; credentials are supplied there,
// never read from public environment variables or included in response data.
export async function lookupMapsPhone(business: MapsPhoneLookupInput, options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const requestedTimeout = options.timeoutMs ?? MAX_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0 ? Math.min(requestedTimeout, MAX_TIMEOUT_MS) : MAX_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const input = parseMapsPhoneLookupInput(business);
    const url = new URL(options.baseUrl);
    if (!input || !options.token.trim() || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error(UNAVAILABLE_MESSAGE);
    }
    url.pathname = `${url.pathname.replace(/\/$/, '')}/lookup`;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(UNAVAILABLE_MESSAGE));
      }, timeoutMs);
    });
    const lookup = async () => {
      const response = await (options.fetchImpl ?? fetch)(url, {
        method: 'POST', cache: 'no-store', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: input.name, city: input.city, region: input.region, ...(input.address !== undefined ? { address: input.address } : {}) })
      });
      if (!response.ok) throw new Error(UNAVAILABLE_MESSAGE);
      const result = matchMapsPhoneCandidate(input, parseCandidates(await response.json()));
      return result.status === 'matched' && !result.candidate.phone ? { status: 'none' as const } : result;
    };
    return await Promise.race([lookup(), deadline]);
  } catch {
    throw new Error(UNAVAILABLE_MESSAGE);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
