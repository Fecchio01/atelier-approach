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
  const searchableName = hasBusinessName ? name : null;
  const addressParts = address?.split(',').map((part) => part.trim()).filter(Boolean) ?? [];
  if (searchableName && addressParts[0]?.localeCompare(searchableName, 'pt-BR', { sensitivity: 'base' }) === 0) addressParts.shift();
  const query = searchableName
    ? [searchableName, addressParts.join(', '), 'Brasil'].filter(Boolean).join(', ')
    : hasCoordinates ? `${latitude},${longitude}` : addressParts.join(', ') || category || '';
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}
