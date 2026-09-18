import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

test('renders contact values as actionable links', () => {
  const cardSource = readFileSync(resolve(process.cwd(), 'components/lead-card.tsx'), 'utf8');

  expect(cardSource).toContain('href={`tel:${business.phone.replace');
  expect(cardSource).toContain('<dd>{websiteHref ? <a');
  expect(cardSource).toContain('<dd>{instagramHref ? <a');
  expect(cardSource).toContain('<dd>{whatsappHref ? <a');
  expect(cardSource).toContain('Abrir no Google Maps');
  expect(cardSource).toContain('toGoogleMapsHref');
  expect(cardSource).toContain('{googleMapsHref ? <a');
  expect(cardSource).not.toContain('!hasDirectLink');
  expect(cardSource).not.toContain('Categoria OSM');
});
