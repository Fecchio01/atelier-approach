/**
 * Removes the technical suffix occasionally appended to fixture/imported names.
 * The source value stays untouched for persistence and external searches.
 */
export function displayCompanyName(name: string | null | undefined) {
  if (!name) return 'Empresa sem nome';
  return name.replace(/\s+(?:[0-9a-f]{6,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i, '').trim() || name;
}
