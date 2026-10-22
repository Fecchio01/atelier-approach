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

  expect(cardSource).not.toContain('displayCategory');
  expect(cardSource).toContain('normalizeInstagramProfileUrl(value)');
  expect(cardSource).not.toContain('toWhatsAppHref(business.whatsapp ?? business.phone)');
  expect(cardSource).not.toContain('MapsPhoneLookup');
  expect(cardSource).toContain('Abrir WhatsApp');
  expect(cardSource).toContain('<dd>{websiteHref ? <a');
  expect(cardSource).toContain('<dd>{instagramHref ? <a');
  expect(cardSource).toContain('Abrir no Google Maps');
  expect(cardSource).toContain('Fonte: {business.source}');
  expect(cardSource).toContain('googleMapsSearchUrl({ name: business.name, address: business.address, category: business.category, latitude: business.latitude, longitude: business.longitude })');
  expect(cardSource).toContain('{googleMapsHref ? <a');
  expect(cardSource).not.toContain('!hasDirectLink');
  expect(cardSource).not.toContain('Buscar site na web');
  expect(cardSource).not.toContain('toBusinessSearchHref');
  expect(cardSource).not.toContain('Categoria OSM');

  const crmModalSource = readFileSync(resolve(process.cwd(), 'components/lead-detail-modal.tsx'), 'utf8');
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

test('does not offer an unvalidated opaque WhatsApp short link', () => {
  const business: ExternalBusiness = {
    osmId: 'overture/wa-link', name: 'Oficina WA Link', category: null,
    source: 'Overture', phone: null, website: null, instagram: null,
    whatsapp: 'http://wa.link/abc123?text=55-11-9999'
  };
  const html = renderToStaticMarkup(React.createElement(LeadCard, { business, result: scoreBusiness(business) }));

  expect(html).not.toContain('href="https://wa.link/');
  expect(html).toContain('Link de WhatsApp indisponível');
});

test('shows the official page where a published WhatsApp link was found', () => {
  const business: ExternalBusiness = {
    osmId: 'overture/wa-source', name: 'Oficina Fonte', category: 'automotive_repair',
    source: 'Overture', phone: '+55 19 3203-5110', website: 'https://oficina-fonte.example', instagram: null,
    whatsapp: 'https://wa.me/551932035110', whatsappSourceUrl: 'https://oficina-fonte.example/contato'
  };
  const html = renderToStaticMarkup(React.createElement(LeadCard, { business, result: scoreBusiness(business) }));

  expect(html).toContain('href="https://oficina-fonte.example/contato"');
  expect(html).toContain('Ver página fonte');
  expect(html).not.toContain('Testar no WhatsApp (não confirmado)');
  expect(html).not.toContain('não confirmado');
});

test('does not reinterpret digits in an explicit WhatsApp URL as a different phone number', () => {
  const business: ExternalBusiness = {
    osmId: 'overture/wa-path', name: 'Oficina WA Path', category: null,
    source: 'Overture', phone: null, website: null, instagram: null,
    whatsapp: 'https://api.whatsapp.com/send/5511999000111?phone=5511888777666&text=pedido-123'
  };
  const html = renderToStaticMarkup(React.createElement(LeadCard, { business, result: scoreBusiness(business) }));

  expect(html).not.toContain('href="https://api.whatsapp.com/send/');
  expect(html).not.toContain('href="https://wa.me/55119990001115511888777666123"');
});

test('offers WhatsApp from a published phone and rejects an Instagram post URL', () => {
  const phoneAsWhatsApp: ExternalBusiness = {
    osmId: 'overture/plain-phone', name: 'Oficina Telefone', category: null,
    source: 'Overture', phone: '+55 11 99999-8888', website: null, instagram: null, whatsapp: null
  };
  const phoneMarkup = renderToStaticMarkup(React.createElement(LeadCard, { business: phoneAsWhatsApp, result: scoreBusiness(phoneAsWhatsApp) }));
  expect(phoneMarkup).toContain('href="https://wa.me/5511999998888"');
  expect(phoneMarkup).toContain('>WhatsApp</a>');
  expect(phoneMarkup).toContain('aria-label="Abrir WhatsApp de Oficina Telefone"');
  expect(phoneMarkup).toContain('Telefone disponível para WhatsApp');
  expect(phoneMarkup).not.toContain('Testar');
  expect(phoneMarkup).not.toContain('não confirmado');
  expect(phoneMarkup).toContain('Telefone publicado');
  expect(phoneMarkup).not.toContain('WhatsApp publicado');
  expect(phoneMarkup).toContain('href="tel:+5511999998888"');
  expect(phoneMarkup).toContain('Telefone disponível para WhatsApp');

  const landline: ExternalBusiness = { ...phoneAsWhatsApp, phone: '+55 11 3333-4444' };
  const landlineMarkup = renderToStaticMarkup(React.createElement(LeadCard, { business: landline, result: scoreBusiness(landline) }));
  expect(landlineMarkup).toContain('href="https://wa.me/551133334444"');
  expect(landlineMarkup).toContain('>+55 11 3333-4444</a>');

  const noPhone: ExternalBusiness = { ...phoneAsWhatsApp, phone: null };
  const noPhoneMarkup = renderToStaticMarkup(React.createElement(LeadCard, { business: noPhone, result: scoreBusiness(noPhone) }));
  expect(noPhoneMarkup).not.toContain('Testar no WhatsApp (não confirmado)');
  expect(noPhoneMarkup).not.toContain('href="https://wa.me/');

  const invalidInstagram: ExternalBusiness = {
    osmId: 'overture/instagram-post', name: 'Oficina Instagram', category: null,
    source: 'Overture', phone: null, website: null, whatsapp: null,
    instagram: 'https://www.instagram.com/p/12345678901/'
  };
  const instagramMarkup = renderToStaticMarkup(React.createElement(LeadCard, { business: invalidInstagram, result: scoreBusiness(invalidInstagram) }));
  expect(instagramMarkup).not.toContain('Instagram disponível');
  expect(instagramMarkup).toContain('Sem canal direto');
});

test('keeps the secondary discard action above the final primary approach action', () => {
  const business: ExternalBusiness = {
    osmId: 'overture/cafe', name: 'Café Bom', category: 'coffee_shop',
    source: 'Overture', phone: null, website: null, instagram: null
  };
  const html = renderToStaticMarkup(React.createElement(LeadCard, { business, result: scoreBusiness(business), onDiscard: async () => {} }));
  const approachButton = html.indexOf('Marcar como abordada');
  const discardButton = html.indexOf('Descartar empresa');

  expect(discardButton).toBeGreaterThan(-1);
  expect(approachButton).toBeGreaterThan(discardButton);
  expect(html.slice(discardButton - 300, discardButton)).toContain('border-white');
  expect(html.lastIndexOf('<button')).toBeLessThan(approachButton);
});
