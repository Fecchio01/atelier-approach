import { getCurrentUser } from '../../../lib/auth';
import { OsmUnavailableError, searchBusinesses } from '../../../lib/osm';

const UNAVAILABLE_MESSAGE = 'A busca no OpenStreetMap está indisponível no momento. Tente novamente em alguns instantes.';

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

  try {
    const businesses = await searchBusinesses({ niche, region, radiusKm });
    return Response.json({ businesses });
  } catch (error) {
    if (error instanceof OsmUnavailableError) {
      return Response.json({ error: UNAVAILABLE_MESSAGE }, { status: 503 });
    }

    throw error;
  }
}
