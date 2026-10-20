import { normalizePublishedPhone, toWhatsAppHref } from './contact-links';

const CACHE_TTL_MS = 10 * 60_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const CONTACT_PAGE_TIMEOUT_MS = 2_500;
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
  whatsappSourceUrl?: string | null;
  instagram: string | null;
  phone: string | null;
  imageUrl: string | null;
  structuredBusinessName: string | null;
  structuredStreetAddress: string | null;
  structuredLocality: string | null;
  structuredRegion: string | null;
  structuredBusinessTypes?: string[];
};

const cache = new Map<string, CachedFields>();

type BusinessIdentity = Pick<ExternalBusiness, 'name' | 'address' | 'category'>;

export async function enrichFromOfficialWebsite(website: string, expectedBusiness?: BusinessIdentity): Promise<EnrichedContactFields> {
  const normalizedWebsite = safeHttpUrl(website);
  if (!normalizedWebsite) return { ...EMPTY_FIELDS };

  const cacheKey = JSON.stringify([normalizedWebsite, expectedBusiness?.name ?? '', expectedBusiness?.address ?? '', expectedBusiness?.category ?? '']);
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
    const homepageFields = extractFields(html, normalizedWebsite, expectedBusiness);
    if (homepageFields.whatsapp) return cacheResult(cacheKey, homepageFields);

    const contactPageUrl = findOfficialContactPageUrl(html, normalizedWebsite);
    if (!contactPageUrl) return cacheResult(cacheKey, homepageFields);

    try {
      const contactResponse = await fetch(contactPageUrl, {
        signal: AbortSignal.timeout(CONTACT_PAGE_TIMEOUT_MS),
        redirect: 'manual',
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'AtelierApproach/1.0 contato@atelier.local' }
      });
      const contactLength = Number(contactResponse.headers.get('content-length'));
      if (!contactResponse.ok || (Number.isFinite(contactLength) && contactLength > MAX_RESPONSE_BYTES)) {
        return cacheResult(cacheKey, homepageFields);
      }

      const contactHtml = await readLimitedText(contactResponse);
      const contactFields = extractFields(contactHtml, normalizedWebsite, expectedBusiness, contactPageUrl);
      if (!contactFields.whatsapp) return cacheResult(cacheKey, homepageFields);
      if (!expectedBusiness) {
        return cacheResult(cacheKey, {
          ...homepageFields,
          whatsapp: contactFields.whatsapp,
          whatsappSourceUrl: contactFields.whatsappSourceUrl ?? contactPageUrl
        });
      }

      const homepageIdentityVerified = isBusinessIdentityVerified(expectedBusiness, homepageFields);
      const contactPageIdentityVerified = isBusinessIdentityVerified(expectedBusiness, contactFields);
      if (hasConflictingStructuredIdentity(expectedBusiness, homepageFields)
        || hasConflictingStructuredIdentity(expectedBusiness, contactFields)
        || (!homepageIdentityVerified && !contactPageIdentityVerified)) {
        return cacheResult(cacheKey, homepageFields);
      }

      // Keep the homepage's verified identity, or use the contact page's
      // identity only when the homepage did not independently verify the place.
      const verifiedFields = homepageIdentityVerified ? homepageFields : contactFields;
      return cacheResult(cacheKey, {
        ...verifiedFields,
        website: normalizedWebsite,
        whatsapp: contactFields.whatsapp,
        whatsappSourceUrl: contactFields.whatsappSourceUrl ?? contactPageUrl
      });
    } catch {
      return cacheResult(cacheKey, homepageFields);
    }
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
    const results = await Promise.all(chunk.map(({ business }) => enrichFromOfficialWebsite(business.website!, business)));
    chunk.forEach(({ index }, resultIndex) => enriched.set(index, results[resultIndex]));
  }
  return businesses.flatMap<ExternalBusiness>((business, index) => {
    const sourcePhone = normalizePublishedPhone(business.phone) ? business.phone : null;
    const source = { ...business, phone: sourcePhone, phoneSource: null, whatsappSourceUrl: null, whatsapp: toWhatsAppHref(business.whatsapp) };
    const fields = enriched.get(index);
    if (!fields) {
      return [source];
    }

    // A named physical business on the linked website is stronger evidence
    // than a stale source association. Never present the two as one company.
    if (fields.structuredBusinessName && (businessNamesContradict(business.name, fields.structuredBusinessName) || hasBusinessSectorConflict(business, fields))) return [];
    const locationVerified = isBusinessIdentityVerified(business, fields);
    const siteNameVerified = isOfficialWebsiteNameVerified(business, fields);
    const phone = locationVerified ? fields.phone ?? sourcePhone : sourcePhone;
    const whatsapp = locationVerified ? toWhatsAppHref(fields.whatsapp) : null;
    return [{
      ...source,
      website: siteNameVerified ? fields.website : business.website,
      phone,
      phoneSource: locationVerified && fields.phone && phone ? 'site oficial verificado' as const : null,
      whatsapp,
      whatsappSourceUrl: locationVerified && whatsapp ? fields.whatsappSourceUrl ?? null : null,
      instagram: siteNameVerified ? fields.instagram ?? business.instagram : business.instagram,
      imageUrl: business.imageUrl ?? (siteNameVerified ? fields.imageUrl : undefined)
    }];
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

function isBusinessIdentityVerified(business: BusinessIdentity, fields: EnrichedContactFields) {
  if (!fields.structuredBusinessName || !fields.structuredLocality || !business.address) return false;
  if (!businessNamesMatch(business.name, fields.structuredBusinessName) || hasBusinessSectorConflict(business, fields)) return false;

  const addressParts = business.address.split(',').map(normalizeIdentityText).filter(Boolean);
  const pageLocality = normalizeIdentityText(fields.structuredLocality);
  const localityMatches = addressParts.some((part) => part === pageLocality);
  if (!localityMatches) return false;

  const street = (value: string) => normalizeIdentityText(value).replace(/^r\s/, 'rua ').replace(/^av\s/, 'avenida ');
  const pageStreet = street(fields.structuredStreetAddress ?? '');
  const sourceStreet = addressParts.find((part) => /^(rua|r|avenida|av|estrada|rodovia|travessa|alameda|praca)\b|\d/.test(part) && !/^\d+$/.test(part));
  if (pageStreet && sourceStreet && !` ${street(business.address)} `.includes(` ${pageStreet} `)) return false;

  if (fields.structuredRegion) {
    const sourceRegion = addressParts.map(normalizeRegion).find((part) => /^(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)$/.test(part));
    if (sourceRegion && sourceRegion !== normalizeRegion(fields.structuredRegion)) return false;
  }
  return true;
}

function businessNamesMatch(businessName: string, officialName: string) {
  if (normalizeIdentityText(businessName) === normalizeIdentityText(officialName)) return true;
  const businessTokens = [...new Set(businessNameTokens(businessName))];
  const officialTokens = new Set(businessNameTokens(officialName));
  return businessTokens.length > 0 && businessTokens.every((token) => officialTokens.has(token));
}

function businessNameTokens(value: string) {
  return normalizeIdentityText(value).split(' ')
    .filter((token) => token.length > 1 && !/^(de|do|da|dos|das|em|no|na|com|para|oficina|auto|automotiva|automotivo|automotivos|servicos|servico|empresa|oficial|brasil|ltda|me|sa)$/.test(token));
}

function businessNamesContradict(first: string, second: string) {
  return !businessNamesMatch(first, second) && businessNameTokens(first).length > 0 && businessNameTokens(second).length > 0;
}

function hasBusinessSectorConflict(business: BusinessIdentity, fields: EnrichedContactFields) {
  const sector = (value: string) => {
    const text = normalizeIdentityText(value.replace(/([a-z])([A-Z])/g, '$1 $2'));
    if (/\b(cafe|cafeteria|coffee|restaurant|restaurante|bakery|padaria)\b/.test(text)) return 'food';
    if (/\b(hospital|medical|health|healthcare|clinic|clinica|dentist|dental|saude)\b/.test(text)) return 'health';
    if (/\b(auto|automotive|automotivo|automotiva|car|vehicle|oficina|mecanica)\b/.test(text)) return 'automotive';
    if (/\b(beauty|hair|barber|salon|salao|barbearia)\b/.test(text)) return 'beauty';
    return null;
  };
  const sourceSector = sector(business.category ?? '');
  const officialSectors = (fields.structuredBusinessTypes ?? []).map(sector).filter(Boolean);
  return Boolean(sourceSector && officialSectors.length && !officialSectors.includes(sourceSector));
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
  return regions[normalized] ?? normalized;
}

function samePhone(first: string, second: string) {
  const normalized = normalizePublishedPhone(first);
  return normalized !== null && normalized === normalizePublishedPhone(second);
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

function extractFields(html: string, website: string, expectedBusiness?: BusinessIdentity, pageUrl = website): EnrichedContactFields {
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const { selected: structured, count: entityCount } = extractStructuredData(html, expectedBusiness);
  const absoluteLinks = [...(structured?.sameAs ?? []), ...hrefs]
    .map((href) => safeHttpUrl(href, pageUrl))
    .filter((href): href is string => Boolean(href));
  const rawPhone = entityCount > 1 ? null : hrefs.find((href) => href.toLowerCase().startsWith('tel:'));
  const phone = normalizePublishedPhone(structured?.telephone ?? rawPhone?.slice(4));
  const ownedLinks = (structured?.sameAs ?? []).map((link) => safeHttpUrl(link, pageUrl)).filter((link): link is string => Boolean(link));
  const whatsapp = absoluteLinks.map(toWhatsAppHref).find((link): link is string => Boolean(link)
    && (entityCount <= 1 || ownedLinks.some((owned) => toWhatsAppHref(owned) === link) || Boolean(phone && samePhone(phone, new URL(link!).pathname.slice(1))))) ?? null;
  const socialLinks = entityCount > 1 ? ownedLinks : absoluteLinks;
  const instagram = socialLinks.find((href) => /^https?:\/\/(www\.)?instagram\.com\//i.test(href)) ?? null;
  const imageUrl = metaContent(html, 'og:image')
    ?? metaContent(html, 'og:image:secure_url')
    ?? metaContent(html, 'twitter:image')
    ?? metaContent(html, 'twitter:image:src');

  return {
    website,
    name: structured?.name ?? metaContent(html, 'og:site_name') ?? metaContent(html, 'og:title') ?? metaContent(html, 'twitter:title'),
    whatsapp,
    ...(whatsapp ? { whatsappSourceUrl: pageUrl } : {}),
    instagram,
    phone,
    imageUrl: safeHttpUrl(imageUrl ?? '', pageUrl),
    structuredBusinessName: structured?.locality
      && (structured.types.some((type) => type !== 'Organization') || !expectedBusiness || businessNamesMatch(expectedBusiness.name, structured.name))
      ? structured.name : null,
    structuredStreetAddress: structured?.streetAddress ?? null,
    structuredLocality: structured?.locality ?? null,
    structuredRegion: structured?.region ?? null,
    ...(structured ? { structuredBusinessTypes: structured.types } : {})
  };
}

function findOfficialContactPageUrl(html: string, website: string) {
  const websiteUrl = new URL(website);
  const candidates = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .flatMap(([, attributes, rawLabel]) => {
      const href = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const value = (href?.[1] ?? href?.[2] ?? href?.[3] ?? '').replace(/&amp;/gi, '&');
      const url = safeHttpUrl(value, website);
      if (!url) return [];

      const target = new URL(url);
      if (target.origin !== websiteUrl.origin) return [];
      target.hash = '';
      if (target.href === websiteUrl.href) return [];

      const label = normalizeIdentityText(rawLabel.replace(/<[^>]*>/g, ' '));
      const path = normalizeIdentityText(target.pathname);
      const descriptor = `${label} ${path}`;
      if (!/\b(whatsapp|contato|contact|fale conosco|fale com|atendimento)\b/.test(descriptor)) return [];

      const priority = /\bwhatsapp\b/.test(descriptor) ? 0 : /\b(contato|contact)\b/.test(descriptor) ? 1 : 2;
      return [{ url: target.toString(), priority }];
    });

  return candidates.sort((first, second) => first.priority - second.priority)[0]?.url ?? null;
}

function hasConflictingStructuredIdentity(business: BusinessIdentity, fields: EnrichedContactFields) {
  if (fields.structuredBusinessName && !businessNamesMatch(business.name, fields.structuredBusinessName)) return true;
  if (hasBusinessSectorConflict(business, fields)) return true;

  const addressParts = business.address?.split(',').map(normalizeIdentityText).filter(Boolean) ?? [];
  if (fields.structuredLocality && addressParts.length
    && !addressParts.includes(normalizeIdentityText(fields.structuredLocality))) return true;

  const pageStreet = (fields.structuredStreetAddress ?? '').split(',')[0]?.trim();
  const sourceStreet = addressParts.find((part) => /^(rua|r|avenida|av|estrada|rodovia|travessa|alameda|praca)\b|\d/.test(part) && !/^\d+$/.test(part));
  const normalizeStreet = (value: string) => normalizeIdentityText(value).replace(/^r\s/, 'rua ').replace(/^av\s/, 'avenida ');
  if (pageStreet && sourceStreet && !` ${sourceStreet} `.includes(` ${normalizeStreet(pageStreet)} `)) return true;

  if (fields.structuredRegion) {
    const sourceRegion = addressParts.map(normalizeRegion)
      .find((part) => /^(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)$/.test(part));
    if (sourceRegion && sourceRegion !== normalizeRegion(fields.structuredRegion)) return true;
  }
  return false;
}

type StructuredBusiness = {
  name: string;
  types: string[];
  telephone: string | null;
  sameAs: string[];
  streetAddress: string | null;
  locality: string | null;
  region: string | null;
};

function extractStructuredData(html: string, expectedBusiness?: BusinessIdentity) {
  const businesses: StructuredBusiness[] = [];
  const blocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const [, rawJson] of blocks) {
    try {
      visitStructuredData(JSON.parse(rawJson), businesses);
    } catch {
      // Ignore malformed structured data and continue with the rest of the page.
    }
  }

  if (!expectedBusiness) return { selected: businesses[0] ?? null, count: businesses.length };
  const matching = businesses.filter((business) => businessNamesMatch(expectedBusiness.name, business.name));
  const local = matching.filter((business) => isBusinessIdentityVerified(expectedBusiness, {
    ...EMPTY_FIELDS, structuredBusinessName: business.name, structuredStreetAddress: business.streetAddress,
    structuredLocality: business.locality, structuredRegion: business.region, structuredBusinessTypes: business.types
  }));
  // Several branches/entities require a unique local match. Never assemble
  // one prospect from the first organization, first phone and every sameAs.
  const selected = local.length === 1 ? local[0] : matching.length === 1 ? matching[0] : businesses.length === 1 ? businesses[0] : null;
  return { selected, count: businesses.length };
}

function visitStructuredData(value: unknown, businesses: StructuredBusiness[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitStructuredData(item, businesses));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const types = (Array.isArray(record['@type']) ? record['@type'] : [record['@type']])
    .filter((type): type is string => typeof type === 'string').map((type) => type.split('/').pop()!);
  const address = record.address && typeof record.address === 'object' && !Array.isArray(record.address)
    ? record.address as Record<string, unknown> : null;
  const businessType = types.some((type) => typeof type === 'string' && /^(LocalBusiness|Organization|AutoRepair|AutoBodyShop|AutomotiveBusiness|Hospital|MedicalClinic|CafeOrCoffeeShop|Restaurant|Store|HairSalon|BeautySalon|Dentist|Hotel|LodgingBusiness)$/i.test(type));
  if (businessType && typeof record.name === 'string' && record.name.trim()) {
    businesses.push({
      name: record.name.trim(),
      types,
      telephone: typeof record.telephone === 'string' ? record.telephone : null,
      sameAs: Array.isArray(record.sameAs) ? record.sameAs.filter((link): link is string => typeof link === 'string') : typeof record.sameAs === 'string' ? [record.sameAs] : [],
      streetAddress: typeof address?.streetAddress === 'string' ? address.streetAddress.trim() || null : null,
      locality: typeof address?.addressLocality === 'string' ? address.addressLocality.trim() || null : null,
      region: typeof address?.addressRegion === 'string' ? address.addressRegion.trim() || null : null
    });
  }

  Object.entries(record).forEach(([relation, item]) => {
    // Page authors/publishers are often the web agency, not the prospect.
    if (['author', 'creator', 'publisher', 'copyrightHolder'].includes(relation)) return;
    visitStructuredData(item, businesses);
  });
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
  if (!value.trim()) return null;
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

import type { ExternalBusiness } from './osm';
