/**
 * Removes the technical suffix occasionally appended to fixture/imported names.
 * The source value stays untouched for persistence and external searches.
 */
export function displayCompanyName(name: string | null | undefined) {
  if (!name) return 'Empresa sem nome';
  const withoutTechnicalId = name.replace(/\s+(?:[0-9a-f]{6,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i, '').trim();
  const comma = withoutTechnicalId.indexOf(',');
  if (comma > 0) {
    const suffix = withoutTechnicalId.slice(comma + 1).trim();
    if (suffix.length >= 50 || /[.!?]/.test(suffix)) {
      return withoutTechnicalId.slice(0, comma).trim();
    }
  }
  return withoutTechnicalId || name;
}
