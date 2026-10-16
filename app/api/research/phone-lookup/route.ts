import { getCurrentUser } from '../../../../lib/auth';
import { lookupMapsPhone, parseMapsPhoneLookupInput } from '../../../../lib/maps-phone-service';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UNAVAILABLE_MESSAGE = 'Não foi possível consultar o telefone agora.';
const WINDOW_MS = 60_000;
const attemptsByUser = new Map<string, number[]>();

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function exceededRateLimit(userId: string) {
  const now = Date.now();
  // Entries live for at most a minute between checks, including inactive users.
  for (const [id, attempts] of attemptsByUser) {
    const active = attempts.filter(time => time > now - WINDOW_MS);
    if (active.length) attemptsByUser.set(id, active);
    else attemptsByUser.delete(id);
  }
  const attempts = attemptsByUser.get(userId) ?? [];
  if (attempts.length >= 5) return true;
  attemptsByUser.set(userId, [...attempts, now]);
  return false;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return response({ error: 'Não autorizado.' }, 401);

  const body: unknown = await request.json().catch(() => null);
  const business = body && typeof body === 'object' && !Array.isArray(body)
    ? parseMapsPhoneLookupInput((body as Record<string, unknown>).business) : null;
  if (!business) return response({ error: 'Informe nome, cidade e UF válidos.' }, 400);

  const baseUrl = process.env.MAPS_TO_LEAD_PHONE_API_URL;
  const token = process.env.MAPS_TO_LEAD_PHONE_API_TOKEN;
  if (!baseUrl?.trim() || !token?.trim()) return response({ error: UNAVAILABLE_MESSAGE }, 503);

  if (exceededRateLimit(user.id)) {
    return response({ error: 'Muitas consultas. Aguarde um minuto para tentar novamente.' }, 429, { 'Retry-After': '60' });
  }
  try {
    return response(await lookupMapsPhone(business, { baseUrl, token }));
  } catch {
    return response({ error: UNAVAILABLE_MESSAGE }, 503);
  }
}
