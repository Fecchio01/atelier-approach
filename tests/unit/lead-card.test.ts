import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { expect, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('motion/react', async () => {
  const ReactModule = await import('react');
  return {
    motion: { article: ({ children, className }: { children: React.ReactNode; className?: string }) => ReactModule.createElement('article', { className }, children) },
    useReducedMotion: () => false
  };
});

import { LeadCard } from '../../components/lead-card';
import { scoreBusiness } from '../../lib/lead-score';
import type { ExternalBusiness } from '../../lib/osm';

test('renders a branded image fallback when a prospect has no real photo', () => {
  const business: ExternalBusiness = {
    osmId: 'overture/garage', name: 'Oficina Bianquini Garage', category: 'automotive_repair',
    source: 'Overture', phone: null, website: null, instagram: null
  };
  const html = renderToStaticMarkup(React.createElement(LeadCard, { business, result: scoreBusiness(business) }));
  const svgImageUrl = html.match(/src="(data:image\/svg\+xml[^"]+)"/)?.[1];

  expect(html).toContain('Identidade visual de Oficina Bianquini Garage');
  expect(svgImageUrl).toBeDefined();
  const fallbackSvg = decodeURIComponent(svgImageUrl!.split(',').slice(1).join(','));
  expect(fallbackSvg).toContain('>BG</text>');
  const [, width, height] = fallbackSvg.match(/viewBox="0 0 (\d+) (\d+)"/) ?? [];
  expect(Number(width) / Number(height)).toBeLessThanOrEqual(2);
  expect(html).not.toContain('Sem foto pública');
});

test('renders contact values as actionable links', () => {
  const cardSource = readFileSync(resolve(process.cwd(), 'components/lead-card.tsx'), 'utf8');

  expect(cardSource).toContain('href={`tel:${business.phone.replace');
  expect(cardSource).toContain('toWhatsAppHref(business.whatsapp);');
  expect(cardSource).not.toContain('displayCategory');
  expect(cardSource).toContain('normalizeInstagramProfileUrl(value)');
  expect(cardSource).not.toContain('toWhatsAppHref(business.whatsapp ?? business.phone)');
  expect(cardSource).not.toContain('possibleWhatsAppHref');
  expect(cardSource).not.toContain('MapsPhoneLookup');
  expect(cardSource).not.toContain('Testar WhatsApp');
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

test('omits raw business categories from the prospect identity', () => {
  const business: ExternalBusiness = {
    osmId: 'overture/cafe', name: 'Café Bom', category: 'coffee_shop',
    source: 'Overture', phone: null, website: null, instagram: null
  };
  const html = renderToStaticMarkup(React.createElement(LeadCard, { business, result: scoreBusiness(business) }));

  expect(html).toContain('<h2');
  expect(html).toContain('Café Bom');
  expect(html).not.toContain('coffee shop');
  expect(html).not.toContain('coffee_shop');
});

test('normalizes Instagram profile links and wraps long contact links', () => {
  const business: ExternalBusiness = {
    osmId: 'overture/cafe', name: 'Café Bom', category: 'coffee_shop',
    source: 'Overture', phone: null, website: 'https://example.com/a-very-long-path-that-must-wrap-in-the-card',
    instagram: '@cafe.bom'
  };
  const html = renderToStaticMarkup(React.createElement(LeadCard, { business, result: scoreBusiness(business) }));

  expect(html).toContain('href="https://www.instagram.com/cafe.bom/"');
  expect(html).toContain('break-all');
});

test('provides a visually secondary discard action beneath the primary approach action', () => {
  const business: ExternalBusiness = {
    osmId: 'overture/cafe', name: 'Café Bom', category: 'coffee_shop',
    source: 'Overture', phone: null, website: null, instagram: null
  };
  const html = renderToStaticMarkup(React.createElement(LeadCard, { business, result: scoreBusiness(business), onDiscard: async () => {} }));
  const approachButton = html.indexOf('Marcar como abordada');
  const discardButton = html.indexOf('Descartar empresa');

  expect(approachButton).toBeGreaterThan(-1);
  expect(discardButton).toBeGreaterThan(approachButton);
  expect(html.slice(discardButton - 300, discardButton)).toContain('border-white');
});
