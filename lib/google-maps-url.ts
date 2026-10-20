type GoogleMapsSearchTarget = {
  name?: string | null;
  address?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function googleMapsSearchUrl({ name, address, category, latitude, longitude }: GoogleMapsSearchTarget) {
  const hasCoordinates = typeof latitude === 'number' && Number.isFinite(latitude)
    && typeof longitude === 'number' && Number.isFinite(longitude);
  const hasBusinessName = Boolean(name?.trim()) && name !== 'Nome comercial não informado' && !/^(yes|no)$/i.test(name!.trim());
  const searchableName = hasBusinessName ? name!.trim() : null;
  const addressParts = address?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];
  if (searchableName && addressParts[0]?.localeCompare(searchableName, 'pt-BR', { sensitivity: 'base' }) === 0) addressParts.shift();
  const locality = extractLocality(addressParts);
  const query = searchableName
    ? [searchableName, locality].filter(Boolean).join(', ')
    : addressParts.length
      ? [...addressParts, 'Brasil'].join(', ')
      : hasCoordinates
        ? `${latitude},${longitude}`
        : category || '';
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

function extractLocality(addressParts: string[]) {
  const parts = [...addressParts];
  if (parts.at(-1)?.toLocaleLowerCase('pt-BR') === 'brasil') parts.pop();

  const stateNames = new Set([
    'acre', 'alagoas', 'amapa', 'amazonas', 'bahia', 'ceara', 'distrito federal', 'espirito santo',
    'goias', 'maranhao', 'mato grosso', 'mato grosso do sul', 'minas gerais', 'para', 'paraiba',
    'parana', 'pernambuco', 'piaui', 'rio de janeiro', 'rio grande do norte', 'rio grande do sul',
    'rondonia', 'roraima', 'santa catarina', 'sao paulo', 'sergipe', 'tocantins'
  ]);
  const stateCodes = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

  let state: string | undefined;
  const lastPart = parts.at(-1);
  if (lastPart && stateCodes.has(lastPart.toUpperCase())) {
    state = lastPart.toUpperCase();
    parts.pop();
  } else if (parts.length >= 2) {
    const lastTwoParts = `${parts.at(-2)} ${parts.at(-1)}`.toLocaleLowerCase('pt-BR')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (stateNames.has(lastTwoParts)) {
      state = parts.splice(-2, 2).join(' ');
    } else {
      const normalizedLastPart = lastPart!.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (stateNames.has(normalizedLastPart)) state = parts.pop();
    }
  }

  const city = parts.at(-1);
  return [city, state].filter(Boolean).join(', ');
}
