import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { scoreBusiness } from '../../../lib/lead-score';
import {
  createOsmSearchService,
  ExternalBusiness,
  OsmSearchSessionExpiredError,
  OsmUnavailableError
} from '../../../lib/osm';

const UNAVAILABLE_MESSAGE = 'A pesquisa está indisponível no momento. Tente novamente em alguns instantes.';
const RATE_LIMIT_MESSAGE = 'Muitas buscas em pouco tempo. Aguarde um minuto antes de tentar novamente.';
const MAX_SEARCHES_PER_MINUTE = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const SEARCH_FILTER_TTL_MS = 15 * 60_000;
const searchAttemptsByUser = new Map<string, number[]>();
const osmSearchService = createOsmSearchService();
const filtersBySearchId = new Map<string, { filters: ResearchFilters; expiresAt: number }>();

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
      const batch = await osmSearchService.continueSearch(searchId);
      return Response.json({
        businesses: await filterBusinessesForResponse(batch.businesses, savedSearch.filters),
        searchId,
        hasMore: batch.hasMore
      });
    } catch (error) {
      if (error instanceof OsmSearchSessionExpiredError) {
        filtersBySearchId.delete(searchId);
        return expiredSearchResponse();
      }
      if (error instanceof OsmUnavailableError) return unavailableResponse();
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

  try {
    const batch = await osmSearchService.startSearch({ niche, region: region ?? '', city, radiusKm: 50, national });
    removeExpiredSavedSearches();
    filtersBySearchId.set(batch.searchId, { filters, expiresAt: Date.now() + SEARCH_FILTER_TTL_MS });

    return Response.json({
      businesses: await filterBusinessesForResponse(batch.businesses, filters),
      searchId: batch.searchId,
      hasMore: batch.hasMore
    });
  } catch (error) {
    if (error instanceof OsmUnavailableError) {
      return unavailableResponse();
    }

    throw error;
  }
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

function unavailableResponse() {
  return Response.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
}

async function filterBusinessesForResponse(businesses: ExternalBusiness[], filters: ResearchFilters) {
  const filteredBusinesses = businesses.filter((business) => matchesResearchFilters(business, filters));
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
