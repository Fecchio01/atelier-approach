const CACHE_TTL_MS = 10 * 60_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const EMPTY_FIELDS: EnrichedContactFields = {
  website: null,
  name: null,
  whatsapp: null,
  instagram: null,
  phone: null,
  imageUrl: null,
  structuredBusinessName: null,
  structuredStreetAddress: null,
  structuredLocality: null,
  structuredRegion: null
};

type CachedFields = { expiresAt: number; value: EnrichedContactFields };

export type EnrichedContactFields = {
  website: string | null;
  name: string | null;
  whatsapp: string | null;
  instagram: string | null;
  phone: string | null;
  imageUrl: string | null;
  structuredBusinessName: string | null;
  structuredStreetAddress: string | null;
  structuredLocality: string | null;
  structuredRegion: string | null;
};

const cache = new Map<string, CachedFields>();

export async function enrichFromOfficialWebsite(website: string): Promise<EnrichedContactFields> {
  const normalizedWebsite = safeHttpUrl(website);
  if (!normalizedWebsite) return { ...EMPTY_FIELDS };

  const cacheKey = normalizedWebsite;
  const cached = cache.get(cacheKey);
  if (cached?.expiresAt && cached.expiresAt > Date.now()) return cached.value;

  const fallback = { ...EMPTY_FIELDS, website: normalizedWebsite };
  try {
    const response = await fetch(normalizedWebsite, {
      signal: AbortSignal.timeout(5_000),
      redirect: 'manual',
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'AtelierApproach/1.0 contato@atelier.local' }
    });
    const contentLength = Number(response.headers.get('content-length'));
    if (response.status === 404 || response.status === 410) {
      return cacheResult(cacheKey, { ...EMPTY_FIELDS });
    }
    if (!response.ok || (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES)) {
      return cacheResult(cacheKey, fallback);
    }

    const html = await readLimitedText(response);
    return cacheResult(cacheKey, extractFields(html, normalizedWebsite));
  } catch {
    return cacheResult(cacheKey, { ...EMPTY_FIELDS });
  }
}

export async function enrichOvertureBusinesses(businesses: ExternalBusiness[]): Promise<ExternalBusiness[]> {
  const candidates = businesses.map((business, index) => ({ business, index }))
    .filter(({ business }) => business.source === 'Overture' && business.website);
  const enriched = new Map<number, EnrichedContactFields>();
  for (let offset = 0; offset < candidates.length; offset += 10) {
    const chunk = candidates.slice(offset, offset + 10);
    const results = await Promise.all(chunk.map(({ business }) => enrichFromOfficialWebsite(business.website!)));
    chunk.forEach(({ index }, resultIndex) => enriched.set(index, results[resultIndex]));
  }
  return businesses.map((business, index) => {
    const fields = enriched.get(index);
    if (!fields) {
      return { ...business };
    }

    const locationVerified = isBusinessIdentityVerified(business, fields);
    const siteNameVerified = isOfficialWebsiteNameVerified(business, fields);
    const phoneConflict = Boolean(business.phone && fields.phone && !samePhone(business.phone, fields.phone));
    const phone = phoneConflict ? null : locationVerified ? fields.phone ?? business.phone : business.phone;
    const whatsappPhone = fields.whatsapp ? whatsappPhoneNumber(fields.whatsapp) : null;
    const whatsapp = locationVerified && phone && whatsappPhone && samePhone(phone, whatsappPhone) ? fields.whatsapp : null;
    return {
      ...business,
      website: siteNameVerified ? fields.website : business.website,
      phone,
      phoneSource: phone ? 'site oficial verificado' as const : null,
      whatsapp,
      instagram: siteNameVerified ? fields.instagram ?? business.instagram : business.instagram,
      imageUrl: business.imageUrl ?? (siteNameVerified ? fields.imageUrl : undefined)
    };
  });
}

function isOfficialWebsiteNameVerified(business: ExternalBusiness, fields: EnrichedContactFields) {
  const pageName = fields.structuredBusinessName ?? fields.name;
  if (!pageName || /\b(instagram|facebook|linkedin|linktree|linktr\.ee|google maps|whatsapp)\b/i.test(pageName)) return false;
  if (business.website) {
    try {
      const host = new URL(business.website).hostname.toLowerCase().replace(/^www\./, '');
      if (['instagram.com', 'facebook.com', 'linkedin.com', 'linktr.ee', 'wa.me'].some((domain) => host === domain || host.endsWith(`.${domain}`))) return false;
    } catch {
      return false;
    }
  }
  return businessNamesMatch(business.name, pageName);
}

function isBusinessIdentityVerified(business: ExternalBusiness, fields: EnrichedContactFields) {
  if (!fields.structuredBusinessName || !fields.structuredLocality || !business.address) return false;
  if (!businessNamesMatch(business.name, fields.structuredBusinessName)) return false;

  const addressParts = business.address.split(',').map(normalizeIdentityText).filter(Boolean);
  const pageLocality = normalizeIdentityText(fields.structuredLocality);
  const pageStreet = normalizeIdentityText(fields.structuredStreetAddress ?? '');
  const localityMatches = addressParts.some((part) => part === pageLocality);
  const streetMatches = Boolean(pageStreet && addressParts.some((part) => part === pageStreet || part.includes(pageStreet)));
  if (!localityMatches && !streetMatches) return false;

  if (fields.structuredRegion) {
    const sourceRegion = addressParts.find((part) => /^[a-z]{2}$/.test(part));
    if (sourceRegion && normalizeRegion(sourceRegion) !== normalizeRegion(fields.structuredRegion)) return false;
  }
  return true;
}

function businessNamesMatch(businessName: string, officialName: string) {
  const tokens = (value: string) => normalizeIdentityText(value).split(' ')
    .filter((token) => token.length > 2 && !/^(oficina|auto|automotiva|automotivo|servicos|servico|empresa|oficial|brasil|ltda|me)$/.test(token));
  const businessTokens = [...new Set(tokens(businessName))];
  const officialTokens = new Set(tokens(officialName));
  return businessTokens.length > 0 && businessTokens.every((token) => officialTokens.has(token));
}

function normalizeIdentityText(value: string) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function normalizeRegion(value: string) {
  const normalized = normalizeIdentityText(value);
  const regions: Record<string, string> = {
    acre: 'ac', alagoas: 'al', amapa: 'ap', amazonas: 'am', bahia: 'ba', ceara: 'ce',
    'distrito federal': 'df', 'espirito santo': 'es', goias: 'go', maranhao: 'ma',
    'mato grosso': 'mt', 'mato grosso do sul': 'ms', 'minas gerais': 'mg', para: 'pa',
    paraiba: 'pb', parana: 'pr', pernambuco: 'pe', piaui: 'pi', 'rio de janeiro': 'rj',
    'rio grande do norte': 'rn', 'rio grande do sul': 'rs', rondonia: 'ro', roraima: 'rr',
    'santa catarina': 'sc', 'sao paulo': 'sp', sergipe: 'se', tocantins: 'to'
  };
  return regions[normalized] ?? normalized.toUpperCase();
}

function samePhone(first: string, second: string) {
  const digits = (value: string) => value.replace(/\D/g, '').replace(/^0+/, '');
  const firstDigits = digits(first);
  const secondDigits = digits(second);
  return Boolean(firstDigits && firstDigits === secondDigits);
}

function whatsappPhoneNumber(value: string) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === 'wa.me'
      ? url.pathname.replace(/\D/g, '') || null
      : url.searchParams.get('phone')?.replace(/\D/g, '') || null;
  } catch {
    return null;
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
  const structured = extractStructuredData(html);
  const absoluteLinks = [...hrefs, ...structured.sameAs]
    .map((href) => safeHttpUrl(href, website))
    .filter((href): href is string => Boolean(href));
  const rawPhone = hrefs.find((href) => href.toLowerCase().startsWith('tel:'));
  const whatsapp = absoluteLinks.find((href) => /^(https:\/\/wa\.me\/|https:\/\/api\.whatsapp\.com\/)/i.test(href)) ?? null;
  const instagram = absoluteLinks.find((href) => /^https?:\/\/(www\.)?instagram\.com\//i.test(href)) ?? null;
  const imageUrl = metaContent(html, 'og:image')
    ?? metaContent(html, 'og:image:secure_url')
    ?? metaContent(html, 'twitter:image')
    ?? metaContent(html, 'twitter:image:src');

  return {
    website,
    name: structured.businessName ?? metaContent(html, 'og:title') ?? metaContent(html, 'og:site_name') ?? metaContent(html, 'twitter:title'),
    whatsapp,
    instagram,
    phone: rawPhone && structured.telephone && !samePhone(rawPhone.slice(4), structured.telephone)
      ? null
      : normalizePhone(rawPhone?.slice(4) ?? structured.telephone),
    imageUrl: safeHttpUrl(imageUrl ?? '', website),
    structuredBusinessName: structured.name,
    structuredStreetAddress: structured.streetAddress,
    structuredLocality: structured.locality,
    structuredRegion: structured.region
  };
}

function extractStructuredData(html: string) {
  const output = {
    name: null as string | null, businessName: null as string | null,
    telephone: null as string | null, sameAs: [] as string[],
    streetAddress: null as string | null, locality: null as string | null, region: null as string | null
  };
  const blocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const [, rawJson] of blocks) {
    try {
      visitStructuredData(JSON.parse(rawJson), output);
    } catch {
      // Ignore malformed structured data and continue with the rest of the page.
    }
  }

  return output;
}

function visitStructuredData(value: unknown, output: { name: string | null; businessName: string | null; telephone: string | null; sameAs: string[]; streetAddress: string | null; locality: string | null; region: string | null }) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitStructuredData(item, output));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  const businessType = types.some((type) => typeof type === 'string' && /localbusiness|organization|autorepair|autobodyshop|automotivebusiness/i.test(type));
  if (businessType) {
    if (!output.businessName && typeof record.name === 'string') output.businessName = record.name.trim() || null;
    if (!output.telephone && typeof record.telephone === 'string') output.telephone = record.telephone;
    const address = typeof record.address === 'string' ? { streetAddress: record.address } : record.address;
    if (!output.name && typeof record.name === 'string' && address && typeof address === 'object' && !Array.isArray(address)) {
      const postalAddress = address as Record<string, unknown>;
      const locality = typeof postalAddress.addressLocality === 'string' ? postalAddress.addressLocality.trim() : '';
      if (locality) {
        output.name = record.name.trim() || null;
        output.streetAddress = typeof postalAddress.streetAddress === 'string' ? postalAddress.streetAddress.trim() || null : null;
        output.locality = locality;
        output.region = typeof postalAddress.addressRegion === 'string' ? postalAddress.addressRegion.trim() || null : null;
        output.telephone = typeof record.telephone === 'string' ? record.telephone : null;
      }
    }
    if (Array.isArray(record.sameAs)) output.sameAs.push(...record.sameAs.filter((link): link is string => typeof link === 'string'));
    else if (typeof record.sameAs === 'string') output.sameAs.push(record.sameAs);
  }

  Object.values(record).forEach((item) => visitStructuredData(item, output));
}

function metaContent(html: string, property: string) {
  const metaTags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag);
  for (const tag of metaTags) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() !== property.toLowerCase()) continue;
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
    if (content) return content.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
  }
  return null;
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
import type { ExternalBusiness } from './osm';
