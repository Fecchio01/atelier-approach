import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

test('renders contact values as actionable links', () => {
  const cardSource = readFileSync(resolve(process.cwd(), 'components/lead-card.tsx'), 'utf8');

  expect(cardSource).toContain('href={`tel:${business.phone.replace');
  expect(cardSource).toContain('toWhatsAppHref(business.whatsapp);');
  expect(cardSource).toContain('{displayCategory ? <p');
  expect(cardSource).not.toContain('toWhatsAppHref(business.whatsapp ?? business.phone)');
  expect(cardSource).toContain('<dd>{websiteHref ? <a');
  expect(cardSource).toContain('<dd>{instagramHref ? <a');
  expect(cardSource).toContain('<dd>{whatsappHref ? <a');
  expect(cardSource).toContain('Abrir no Google Maps');
  expect(cardSource).toContain('Fonte: {business.source}');
  expect(cardSource).toContain('googleMapsSearchUrl({ name: business.name, address: business.address, category: business.category, latitude: business.latitude, longitude: business.longitude })');
  expect(cardSource).toContain('{googleMapsHref ? <a');
  expect(cardSource).not.toContain('!hasDirectLink');
  expect(cardSource).not.toContain('Buscar site na web');
  expect(cardSource).not.toContain('toBusinessSearchHref');
  expect(cardSource).not.toContain('Categoria OSM');

  const crmModalSource = readFileSync(resolve(process.cwd(), 'components/lead-detail-modal.tsx'), 'utf8');
  expect(crmModalSource).toContain('const whatsapp = lead.whatsapp;');
  expect(crmModalSource).toContain('googleMapsSearchUrl({ name: lead.name, address: lead.address, category: lead.category, latitude: lead.latitude, longitude: lead.longitude })');
  expect(crmModalSource).not.toContain('lead.whatsapp ?? lead.phone');
});
