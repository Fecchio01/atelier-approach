import { getCurrentUser } from '../../../lib/auth';
import { prisma } from '../../../lib/db';
import { OsmUnavailableError, searchBusinesses } from '../../../lib/osm';

const UNAVAILABLE_MESSAGE = 'A busca no OpenStreetMap está indisponível no momento. Tente novamente em alguns instantes.';
const RATE_LIMIT_MESSAGE = 'Muitas buscas em pouco tempo. Aguarde um minuto antes de tentar novamente.';
const MAX_SEARCHES_PER_MINUTE = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const searchAttemptsByUser = new Map<string, number[]>();

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const niche = searchParams.get('niche')?.trim();
  const region = searchParams.get('region')?.trim();
  const radiusKm = Number(searchParams.get('radiusKm'));

  if (!niche || !region || !Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 50) {
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
    const existingLeads = await prisma.lead.findMany({
      where: { osmId: { in: businesses.map((business) => business.osmId) } },
      select: { osmId: true }
    });
    const existingOsmIds = new Set(existingLeads.map((lead) => lead.osmId));

    return Response.json({
      businesses: businesses.filter((business) => !existingOsmIds.has(business.osmId))
    });
  } catch (error) {
    if (error instanceof OsmUnavailableError) {
      return Response.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    throw error;
  }
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
