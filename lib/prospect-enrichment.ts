const CACHE_TTL_MS = 10 * 60_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const EMPTY_FIELDS: EnrichedContactFields = {
  website: null,
  whatsapp: null,
  instagram: null,
  phone: null,
  imageUrl: null
};

type CachedFields = { expiresAt: number; value: EnrichedContactFields };

export type EnrichedContactFields = {
  website: string | null;
  whatsapp: string | null;
  instagram: string | null;
  phone: string | null;
  imageUrl: string | null;
};

const cache = new Map<string, CachedFields>();

export async function enrichFromOfficialWebsite(website: string): Promise<EnrichedContactFields> {
  const normalizedWebsite = safeHttpUrl(website);
  if (!normalizedWebsite) return { ...EMPTY_FIELDS };

  const cacheKey = new URL(normalizedWebsite).hostname;
  const cached = cache.get(cacheKey);
  if (cached?.expiresAt && cached.expiresAt > Date.now()) return cached.value;

  const fallback = { ...EMPTY_FIELDS, website: normalizedWebsite };
  try {
    const response = await fetch(normalizedWebsite, {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'AtelierApproach/1.0 contato@atelier.local' }
    });
    const contentLength = Number(response.headers.get('content-length'));
    if (!response.ok || (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES)) {
      return cacheResult(cacheKey, fallback);
    }

    const html = await readLimitedText(response);
    return cacheResult(cacheKey, extractFields(html, normalizedWebsite));
  } catch {
    return cacheResult(cacheKey, fallback);
  }
}

function cacheResult(cacheKey: string, value: EnrichedContactFields) {
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function readLimitedText(response: Response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteCount += value.byteLength;
    if (byteCount > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return '';
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function extractFields(html: string, website: string): EnrichedContactFields {
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const absoluteLinks = hrefs.map((href) => safeHttpUrl(href, website)).filter((href): href is string => Boolean(href));
  const rawPhone = hrefs.find((href) => href.toLowerCase().startsWith('tel:'));
  const whatsapp = absoluteLinks.find((href) => /^(https:\/\/wa\.me\/|https:\/\/api\.whatsapp\.com\/)/i.test(href)) ?? null;
  const instagram = absoluteLinks.find((href) => /^https?:\/\/(www\.)?instagram\.com\//i.test(href)) ?? null;
  const imageMatch = html.match(/<meta[^>]+(?:property|name)\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["']og:image["']/i);

  return {
    website,
    whatsapp,
    instagram,
    phone: normalizePhone(rawPhone?.slice(4) ?? null),
    imageUrl: safeHttpUrl(imageMatch?.[1] ?? '', website)
  };
}

function safeHttpUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || isPrivateHost(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateHost(hostname: string) {
  const lower = hostname.toLowerCase();
  return lower === 'localhost' || lower.endsWith('.local') || lower === '::1' || /^127\./.test(lower) || /^10\./.test(lower) || /^192\.168\./.test(lower) || /^169\.254\./.test(lower) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower);
}

function normalizePhone(value: string | null) {
  if (!value) return null;
  const compact = value.trim().replace(/[^\d+]/g, '');
  return compact.length >= 8 ? compact : null;
}
