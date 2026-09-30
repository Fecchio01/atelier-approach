import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { approachabilityRank, scoreBusiness } from '../../../lib/lead-score';
import { enrichOvertureBusinesses } from '../../../lib/prospect-enrichment';
import {
  createOsmSearchService,
  ExternalBusiness,
  isGenericBusinessName
} from '../../../lib/osm';
import {
  OvertureSearchArea,
  planOvertureSearchAreas,
  searchOvertureArea,
  splitOvertureSearchArea
} from '../../../lib/overture';

export const runtime = 'nodejs';

const UNAVAILABLE_MESSAGE = 'Não foi possível consultar a base Overture nesta região agora. Nenhuma lista de outra fonte foi misturada; tente novamente em alguns instantes.';
const RATE_LIMIT_MESSAGE = 'Muitas buscas em pouco tempo. Aguarde um minuto antes de tentar novamente.';
const MAX_SEARCHES_PER_MINUTE = 5;
const MIN_PROGRESSIVE_SEARCH_RESULTS = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const SEARCH_FILTER_TTL_MS = 15 * 60_000;
const INITIAL_RESULTS_PER_PAGE = 60;
const MAX_OVERTURE_AREAS_PER_REQUEST = 4;
const searchAttemptsByUser = new Map<string, number[]>();
// OpenStreetMap is used only to resolve state/city bounds. Prospect records
// always come from Overture; this route never falls back to OSM business data.
const searchBoundsService = createOsmSearchService();
const filtersBySearchId = new Map<string, SavedSearch>();

type SavedSearch = {
  filters: ResearchFilters;
  expiresAt: number;
  overtureAreas: OvertureSearchArea[];
  overtureQueue: ExternalBusiness[];
  seenBusinessIds: Set<string>;
  seenBusinesses: ExternalBusiness[];
};

class OvertureUnavailableError extends Error {}

type ResearchFilters = {
  phoneOnly: boolean;
  digitalPresence: boolean;
  minScore: number | null;
  maxScore: number | null;
  includeWorked: boolean;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const searchId = searchParams.get('searchId')?.trim();

  if (searchId) {
    const savedSearch = getSavedSearch(searchId);
    if (!savedSearch) return expiredSearchResponse();

    try {
      const businesses = await consumeOverturePage(savedSearch);
      savedSearch.expiresAt = Date.now() + SEARCH_FILTER_TTL_MS;
      return Response.json({
        businesses: sortForResearchPage(businesses),
        searchId,
        hasMore: hasMoreOvertureAreas(savedSearch)
      });
    } catch (error) {
      if (error instanceof OvertureUnavailableError) return unavailableResponse();
      throw error;
    }
  }

  const niche = searchParams.get('niche')?.trim();
  const region = searchParams.get('region')?.trim();
  const city = searchParams.get('city')?.trim() || undefined;
  const national = searchParams.get('national') === 'true';
  const filters = parseResearchFilters(searchParams);

  if (!niche || (!national && !region) || !filters) {
    return Response.json(
      { error: 'Informe nicho e região.' },
      { status: 400 }
    );
  }

  if (hasExceededSearchRateLimit(user.id)) {
    return Response.json(
      { error: RATE_LIMIT_MESSAGE },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const bounds = await searchBoundsService.resolveSearchBounds(region ?? '', city, national).catch(() => null);
  if (!bounds) {
    return unavailableResponse('Não foi possível localizar os limites dessa região. Confira o estado/cidade e tente novamente.');
  }

  const overtureSearch: SavedSearch = {
    filters,
    expiresAt: Date.now() + SEARCH_FILTER_TTL_MS,
    overtureAreas: planOvertureSearchAreas(bounds, national, region ?? ''),
    overtureQueue: [],
    seenBusinessIds: new Set(),
    seenBusinesses: []
  };

  try {
    const businesses = await consumeOverturePage(overtureSearch);
    const overtureSearchId = crypto.randomUUID();
    removeExpiredSavedSearches();
    filtersBySearchId.set(overtureSearchId, overtureSearch);
    return Response.json({
      businesses: sortForResearchPage(businesses),
      searchId: overtureSearchId,
      hasMore: hasMoreOvertureAreas(overtureSearch)
    });
  } catch (error) {
    if (error instanceof OvertureUnavailableError) return unavailableResponse();
    throw error;
  }
}

async function consumeOverturePage(savedSearch: SavedSearch) {
  const businesses: ExternalBusiness[] = [];
  let queriedAreas = 0;
  let successfulAreaQueries = 0;
  let failedAreaQueries = 0;

  while (
    businesses.length < MIN_PROGRESSIVE_SEARCH_RESULTS
    && businesses.length < INITIAL_RESULTS_PER_PAGE
    && hasMoreOvertureAreas(savedSearch)
  ) {
    if (savedSearch.overtureQueue.length) {
      const candidates = savedSearch.overtureQueue.splice(0, INITIAL_RESULTS_PER_PAGE - businesses.length);
      businesses.push(...await filterBusinessesForResponse(candidates, savedSearch.filters));
      continue;
    }

    if (queriedAreas >= MAX_OVERTURE_AREAS_PER_REQUEST) break;
    const area = savedSearch.overtureAreas.shift();
    if (!area) break;
    queriedAreas += 1;

    try {
      const result = await searchOvertureArea(area);
      successfulAreaQueries += 1;
      const unseen = result.businesses.filter((business) => {
        if (savedSearch.seenBusinessIds.has(business.osmId)) return false;
        savedSearch.seenBusinessIds.add(business.osmId);
        if (savedSearch.seenBusinesses.some((seen) => sameNamedLocation(seen, business))) return false;
        savedSearch.seenBusinesses.push(business);
        return true;
      });
      savedSearch.overtureQueue.push(...sortForResearchPage(unseen));
      if (result.hitLimit) {
        const children = splitOvertureSearchArea(area);
        savedSearch.overtureAreas.splice(Math.min(8, savedSearch.overtureAreas.length), 0, ...children);
      }
    } catch {
      failedAreaQueries += 1;
      savedSearch.overtureAreas.unshift(...splitOvertureSearchArea(area));
    }
  }

  if (!successfulAreaQueries && failedAreaQueries) throw new OvertureUnavailableError();
  return enrichOvertureBusinesses(businesses);
}

function hasMoreOvertureAreas(savedSearch: SavedSearch) {
  return savedSearch.overtureQueue.length > 0 || savedSearch.overtureAreas.length > 0;
}

function sameNamedLocation(first: ExternalBusiness, second: ExternalBusiness) {
  if (first.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    !== second.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()) return false;
  return typeof first.latitude === 'number' && typeof first.longitude === 'number'
    && typeof second.latitude === 'number' && typeof second.longitude === 'number'
    && Math.abs(first.latitude - second.latitude) < 0.00025
    && Math.abs(first.longitude - second.longitude) < 0.00025;
}

function sortForResearchPage(businesses: ExternalBusiness[]) {
  return [...businesses].sort((first, second) => {
    const firstScore = scoreBusiness(first);
    const secondScore = scoreBusiness(second);
    return approachabilityRank(first) - approachabilityRank(second)
      || secondScore.score - firstScore.score
      || first.name.localeCompare(second.name, 'pt-BR');
  });
}

function removeExpiredSavedSearches() {
  const now = Date.now();
  for (const [searchId, savedSearch] of filtersBySearchId) {
    if (savedSearch.expiresAt <= now) filtersBySearchId.delete(searchId);
  }
}

function getSavedSearch(searchId: string) {
  const savedSearch = filtersBySearchId.get(searchId);
  if (!savedSearch || savedSearch.expiresAt <= Date.now()) {
    filtersBySearchId.delete(searchId);
    return null;
  }
  return savedSearch;
}

function expiredSearchResponse() {
  return Response.json(
    { error: 'Sua busca expirou. Inicie uma nova pesquisa para continuar.' },
    { status: 410 }
  );
}

function unavailableResponse(message = UNAVAILABLE_MESSAGE) {
  return Response.json({ error: message }, { status: 503 });
}

async function filterBusinessesForResponse(businesses: ExternalBusiness[], filters: ResearchFilters) {
  const filteredBusinesses = businesses.filter((business) => hasVerifiableName(business.name)
    && matchesResearchFilters(business, filters));
  const existingLeads = await prisma.lead.findMany({
    where: { osmId: { in: filteredBusinesses.map((business) => business.osmId) } },
    select: { id: true, osmId: true }
  });
  const leadsByOsmId = new Map(existingLeads.map((lead) => [lead.osmId, lead]));

  return filteredBusinesses.flatMap((business) => {
    const existingLead = leadsByOsmId.get(business.osmId);
    if (existingLead && !filters.includeWorked) return [];
    if (!filters.includeWorked) return [business];
    return [{
      ...business,
      alreadyWorked: Boolean(existingLead),
      crmHref: existingLead ? `/crm?lead=${existingLead.id}` : null
    }];
  });
}

function hasVerifiableName(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return Boolean(normalized)
    && normalized !== 'nome comercial nao informado'
    && normalized !== 'yes'
    && normalized !== 'no'
    && !isGenericBusinessName(name);
}

function parseResearchFilters(searchParams: URLSearchParams): ResearchFilters | null {
  const minScore = parseScore(searchParams.get('minScore'));
  const maxScore = parseScore(searchParams.get('maxScore'));
  if (minScore === undefined || maxScore === undefined || (minScore !== null && maxScore !== null && minScore > maxScore)) {
    return null;
  }
  return {
    phoneOnly: searchParams.get('phoneOnly') === 'true',
    digitalPresence: searchParams.get('digitalPresence') === 'true',
    minScore,
    maxScore,
    includeWorked: searchParams.get('includeWorked') === 'true'
  };
}

function parseScore(value: string | null) {
  if (value === null || value === '') return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 100 ? score : undefined;
}

function matchesResearchFilters(
  business: ExternalBusiness,
  filters: ResearchFilters
) {
  const { score } = scoreBusiness(business);
  return (!filters.phoneOnly || Boolean(business.phone || business.whatsapp))
    && (!filters.digitalPresence || Boolean(business.website || business.instagram))
    && (filters.minScore === null || score >= filters.minScore)
    && (filters.maxScore === null || score <= filters.maxScore);
}

function hasExceededSearchRateLimit(userId: string) {
  const now = Date.now();
  const recentAttempts = (searchAttemptsByUser.get(userId) ?? []).filter(
    (attemptedAt) => attemptedAt > now - RATE_LIMIT_WINDOW_MS
  );

  if (recentAttempts.length >= MAX_SEARCHES_PER_MINUTE) {
    searchAttemptsByUser.set(userId, recentAttempts);
    return true;
  }

  recentAttempts.push(now);
  searchAttemptsByUser.set(userId, recentAttempts);
  return false;
}
