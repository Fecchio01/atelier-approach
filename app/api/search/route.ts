import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { scoreBusiness } from '../../../lib/lead-score';
import { OsmUnavailableError, searchBusinesses } from '../../../lib/osm';

const UNAVAILABLE_MESSAGE = 'A pesquisa está indisponível no momento. Tente novamente em alguns instantes.';
const RATE_LIMIT_MESSAGE = 'Muitas buscas em pouco tempo. Aguarde um minuto antes de tentar novamente.';
const MAX_SEARCHES_PER_MINUTE = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const searchAttemptsByUser = new Map<string, number[]>();

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
  const niche = searchParams.get('niche')?.trim();
  const region = searchParams.get('region')?.trim();
  const radiusKm = Number(searchParams.get('radiusKm'));
  const filters = parseResearchFilters(searchParams);

  if (!niche || !region || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50 || !filters) {
    return Response.json(
      { error: 'Informe nicho, região e um raio entre 1 e 50 km.' },
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
    const businesses = await searchBusinesses({ niche, region, radiusKm });
    const filteredBusinesses = businesses.filter((business) => matchesResearchFilters(business, filters));
    const existingLeads = await prisma.lead.findMany({
      where: { osmId: { in: filteredBusinesses.map((business) => business.osmId) } },
      select: { id: true, osmId: true }
    });
    const leadsByOsmId = new Map(existingLeads.map((lead) => [lead.osmId, lead]));

    const responseBusinesses = filteredBusinesses.flatMap((business) => {
      const existingLead = leadsByOsmId.get(business.osmId);
      if (existingLead && !filters.includeWorked) return [];
      if (!filters.includeWorked) return [business];
      return [{
        ...business,
        alreadyWorked: Boolean(existingLead),
        crmHref: existingLead ? `/crm?lead=${existingLead.id}` : null
      }];
    });

    return Response.json({
      businesses: responseBusinesses
    });
  } catch (error) {
    if (error instanceof OsmUnavailableError) {
      return Response.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    throw error;
  }
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
  business: Awaited<ReturnType<typeof searchBusinesses>>[number],
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
