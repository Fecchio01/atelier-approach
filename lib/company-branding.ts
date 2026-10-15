const genericNameParts = new Set([
  'auto', 'automotiva', 'automotivo', 'automotivas', 'automotivos', 'automecanica',
  'centro', 'estetica', 'mecanica', 'mecanico', 'oficina', 'pecas', 'servico', 'servicos'
]);

export function getCompanyInitials(name: string) {
  const words = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const distinctWords = words.filter((word) => !genericNameParts.has(word.toLowerCase()));
  const selectedWords = (distinctWords.length ? distinctWords : words).slice(0, 2);
  return selectedWords.map((word) => word[0].toLocaleUpperCase('pt-BR')).join('') || 'EM';
}

export function getCompanyBrandImage(name: string) {
  const title = escapeXml(clampText(name, 48));
  const initials = escapeXml(getCompanyInitials(name));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="480" viewBox="0 0 1200 480"><defs><linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b241e"/><stop offset="1" stop-color="#111615"/></linearGradient><linearGradient id="mark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a3e635" stop-opacity=".19"/><stop offset="1" stop-color="#a3e635" stop-opacity=".035"/></linearGradient></defs><rect width="1200" height="480" rx="32" fill="url(#surface)"/><circle cx="1110" cy="80" r="210" fill="#a3e635" fill-opacity=".035"/><circle cx="1110" cy="80" r="150" fill="none" stroke="#a3e635" stroke-opacity=".12" stroke-width="2"/><path d="M0 420h1200" stroke="#ffffff" stroke-opacity=".08"/><text x="56" y="78" fill="#a3e635" font-family="Arial,sans-serif" font-size="20" font-weight="700" letter-spacing="5">IDENTIDADE DA EMPRESA</text><rect x="56" y="130" width="116" height="116" rx="28" fill="url(#mark)" stroke="#a3e635" stroke-opacity=".2"/><text x="114" y="208" text-anchor="middle" fill="#d8f99a" font-family="Arial,sans-serif" font-size="54" font-weight="700" letter-spacing="2">${initials}</text><text x="56" y="322" fill="#f4f6f4" font-family="Arial,sans-serif" font-size="38" font-weight="600">${title}</text><text x="1140" y="365" text-anchor="end" fill="#a3e635" fill-opacity=".075" font-family="Arial,sans-serif" font-size="240" font-weight="700">${initials}</text><text x="56" y="438" fill="#a8b0aa" font-family="Arial,sans-serif" font-size="17" letter-spacing="3">PRESENÇA DIGITAL</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function clampText(value: string, maxLength: number) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
