import { build } from 'esbuild';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const business = {
  osmId: 'overture/cafe', name: 'Café das Flores', address: 'Rua das Flores, 100',
  phone: '+551932224444', phoneSource: 'site oficial verificado',
  website: 'https://cafe.example.test', instagram: '@cafedasflores', source: 'Overture'
};
const candidate = { name: 'Café das Flores', phone: '+5519999998888', address: 'Rua das Flores, 100', city: 'Campinas', region: 'SP' };
let browser: Browser;
let context: BrowserContext;
let page: Page;
let bundle: string;
const requests: { path: string; body: unknown }[] = [];

beforeAll(async () => {
  const output = await build({
    stdin: {
      contents: `import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { MapsPhoneLookup } from './components/maps-phone-lookup';
        import { LeadCard } from './components/lead-card';
        import PesquisaPage from './app/(app)/pesquisa/page';
        import { scoreBusiness } from './lib/lead-score';
        const root = createRoot(document.getElementById('root'));
        window.renderLookup = (props, card = false) => root.render(card
          ? React.createElement(LeadCard, { ...props, result: scoreBusiness(props.business) })
          : React.createElement(MapsPhoneLookup, props));
        window.renderResearch = (visible = true) => root.render(visible ? React.createElement(PesquisaPage) : null);`,
      resolveDir: process.cwd(), loader: 'tsx'
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'next-router-fixture', setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function useRouter() { return { push() {} }; }' }));
    } }]
  });
  bundle = output.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 30_000);

beforeEach(async () => {
  requests.length = 0;
  context = await browser.newContext();
  page = await context.newPage();
  await page.route('https://research.example.test/**', async route => {
    if (route.request().resourceType() === 'document') {
      await route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
    } else {
      requests.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      await route.fulfill({ json: {} });
    }
  });
  await page.goto('https://research.example.test');
  await page.addScriptTag({ content: bundle });
});

afterEach(async () => { await context?.close(); });
afterAll(async () => { await browser?.close(); });

async function render(city = 'Campinas', region = 'São Paulo, SP', card = false) {
  await page.evaluate(({ business, city, region, card }) => {
    (window as unknown as { renderLookup: (props: unknown, card: boolean) => void }).renderLookup({ business, city, region }, card);
  }, { business, city, region, card });
}

async function respond(payload: unknown, status = 200) {
  await page.route('**/api/research/phone-lookup', async route => {
    requests.push({ path: '/api/research/phone-lookup', body: route.request().postDataJSON() });
    await route.fulfill({ status, json: payload });
  });
}

describe('on-demand Maps phone lookup', () => {
  test('uses submitted FormData location after draft edits and for loaded-more companies', async () => {
    const queries: URLSearchParams[] = [];
    await page.route('**/api/search?**', async route => {
      const query = new URL(route.request().url()).searchParams;
      queries.push(query);
      const continuation = query.has('searchId');
      await route.fulfill({ json: { businesses: [{ ...business, ...(continuation ? { osmId: 'overture/second', name: 'Café Novo' } : {}) }], searchId: 'search-campinas', hasMore: !continuation } });
    });
    await respond({ status: 'none' });
    await page.evaluate(() => (window as unknown as { renderResearch: () => void }).renderResearch());
    await page.getByLabel('Nicho', { exact: true }).fill('café');
    await page.getByLabel('Região / estado').selectOption('São Paulo, SP');
    await page.getByLabel('Cidade (opcional)').fill('Santos');
    // Browser-restored/native form values can differ from React's draft state.
    await page.getByLabel('Cidade (opcional)').evaluate(input => { (input as HTMLInputElement).value = 'Campinas'; });
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
    await page.getByRole('heading', { name: 'Café das Flores' }).waitFor();
    expect(queries[0].get('city')).toBe('Campinas');
    expect(queries[0].get('region')).toBe('São Paulo, SP');

    await page.getByLabel('Região / estado').selectOption('Rio de Janeiro, RJ');
    await page.getByLabel('Cidade (opcional)').fill('Rio de Janeiro');
    await page.getByRole('button', { name: 'Testar telefone no Maps' }).click();
    await page.getByText('Nenhum telefone confirmado para esta empresa.').waitFor();
    await page.getByRole('button', { name: 'Carregar mais empresas' }).click();
    const nextCard = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Café Novo' }) });
    await nextCard.getByRole('button', { name: 'Testar telefone no Maps' }).click();
    await nextCard.getByText('Nenhum telefone confirmado para esta empresa.').waitFor();
    expect(requests.filter(request => request.path === '/api/research/phone-lookup').map(request => request.body)).toEqual([
      { business: { name: 'Café das Flores', address: 'Rua das Flores, 100', city: 'Campinas', region: 'SP' } },
      { business: { name: 'Café Novo', address: 'Rua das Flores, 100', city: 'Campinas', region: 'SP' } }
    ]);
    expect(queries[1].toString()).toBe('searchId=search-campinas');
  });

  test('restores result location separately from unsent draft filters', async () => {
    await page.route('**/api/search?**', route => route.fulfill({ json: { businesses: [business], searchId: 'search-campinas', hasMore: false } }));
    await respond({ status: 'none' });
    await page.evaluate(() => (window as unknown as { renderResearch: () => void }).renderResearch());
    await page.getByLabel('Nicho', { exact: true }).fill('café');
    await page.getByLabel('Região / estado').selectOption('São Paulo, SP');
    await page.getByLabel('Cidade (opcional)').fill('Campinas');
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
    await page.getByRole('heading', { name: 'Café das Flores' }).waitFor();
    await page.getByLabel('Cidade (opcional)').fill('Santos');
    await page.evaluate(() => (window as unknown as { renderResearch: (visible: boolean) => void }).renderResearch(false));
    await page.getByRole('heading', { name: 'Café das Flores' }).waitFor({ state: 'detached' });
    await page.evaluate(() => (window as unknown as { renderResearch: () => void }).renderResearch());
    await page.getByRole('heading', { name: 'Café das Flores' }).waitFor();
    expect(await page.getByLabel('Cidade (opcional)').inputValue()).toBe('Santos');
    await page.getByRole('button', { name: 'Testar telefone no Maps' }).click();
    await page.getByText('Nenhum telefone confirmado para esta empresa.').waitFor();
    expect(requests).toEqual([{ path: '/api/research/phone-lookup', body: { business: { name: 'Café das Flores', address: 'Rua das Flores, 100', city: 'Campinas', region: 'SP' } } }]);
  });

  test('does not enable lookup on state-wide results when only the draft gains a city', async () => {
    await page.route('**/api/search?**', route => route.fulfill({ json: { businesses: [business], searchId: 'search-state', hasMore: false } }));
    await page.evaluate(() => (window as unknown as { renderResearch: () => void }).renderResearch());
    await page.getByLabel('Nicho', { exact: true }).fill('café');
    await page.getByLabel('Região / estado').selectOption('São Paulo, SP');
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
    await page.getByRole('heading', { name: 'Café das Flores' }).waitFor();
    await page.getByLabel('Cidade (opcional)').fill('Campinas');
    expect(await page.getByRole('button', { name: 'Testar telefone no Maps' }).count()).toBe(0);
    expect(requests).toEqual([]);
  });

  test('waits for explicit action and sends only selected identity/location with the parsed UF', async () => {
    await respond({ status: 'matched', candidate });
    await render();
    const button = page.getByRole('button', { name: 'Testar telefone no Maps' });
    await button.waitFor();
    expect(requests).toEqual([]);
    await button.click();
    await page.getByText('Telefone encontrado — conferir', { exact: true }).waitFor();
    expect(requests).toEqual([{ path: '/api/research/phone-lookup', body: { business: { name: 'Café das Flores', address: 'Rua das Flores, 100', city: 'Campinas', region: 'SP' } } }]);
    expect(await page.getByText('WhatsApp não confirmado', { exact: true }).count()).toBe(1);
    expect(await page.getByRole('link', { name: 'Ligar para o telefone encontrado no Maps' }).getAttribute('href')).toBe('tel:+5519999998888');
    expect(await page.getByRole('link', { name: 'Testar no WhatsApp' }).getAttribute('href')).toBe('https://wa.me/5519999998888');
  });

  test('disables the action while pending and performs no concurrent duplicate request', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/research/phone-lookup', async route => {
      requests.push({ path: '/api/research/phone-lookup', body: route.request().postDataJSON() });
      await gate;
      await route.fulfill({ json: { status: 'none' } });
    });
    await render();
    await page.getByRole('button', { name: 'Testar telefone no Maps' }).click();
    const pending = page.getByRole('button', { name: 'Consultando telefone…' });
    await pending.waitFor();
    expect(await pending.isDisabled()).toBe(true);
    await pending.dispatchEvent('click');
    expect(requests).toHaveLength(1);
    release();
    await page.getByText('Nenhum telefone confirmado para esta empresa.').waitFor();
  });

  test.each([
    [{ status: 'none' }, 200, 'Nenhum telefone confirmado para esta empresa.'],
    [{ status: 'ambiguous' }, 200, 'Mais de uma empresa corresponde à busca. Não foi possível confirmar o telefone.'],
    [{ error: 'private provider details' }, 503, 'Consulta indisponível no momento. Tente novamente.'],
    [{ error: 'too many' }, 429, 'Limite de consultas atingido. Aguarde um minuto e tente novamente.']
  ])('shows a safe, accessible outcome without exposing a phone: %j', async (payload, status, message) => {
    await respond(payload, status);
    await render();
    await page.getByRole('button', { name: 'Testar telefone no Maps' }).click();
    await page.getByText(message, { exact: true }).waitFor();
    expect(await page.getByRole('link').count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Testar telefone no Maps' }).isEnabled()).toBe(true);
    expect(await page.locator('[role="status"], [role="alert"]').textContent()).toContain(message);
    expect(await page.locator('body').textContent()).not.toContain('private provider');
  });

  test.each([['', 'São Paulo, SP'], ['Campinas', ''], ['  ', 'SP']])('omits lookup when city/UF is missing (%s, %s)', async (city, region) => {
    await render(city, region, true);
    await page.getByRole('heading', { name: 'Café das Flores' }).waitFor();
    expect(await page.getByRole('button', { name: 'Testar telefone no Maps' }).count()).toBe(0);
    expect(requests).toEqual([]);
  });

  test('keeps the official phone primary and excludes the transient result from CRM and a fresh mount', async () => {
    await respond({ status: 'matched', candidate });
    await render('Campinas', 'São Paulo, SP', true);
    await page.getByRole('button', { name: 'Testar telefone no Maps' }).click();
    await page.getByText('Telefone encontrado — conferir', { exact: true }).waitFor();
    expect(await page.getByRole('link', { name: 'Ligar para Café das Flores', exact: true }).getAttribute('href')).toBe('tel:+551932224444');
    expect(await page.getByText('Publicado no site oficial verificado').count()).toBe(1);
    expect(requests.map(request => request.path)).toEqual(['/api/research/phone-lookup']);
    await page.getByRole('button', { name: 'Marcar como abordada' }).click();
    const saved = page.waitForResponse('**/api/leads');
    await page.getByRole('button', { name: 'Salvar abordagem' }).click();
    await saved;
    expect(requests.find(request => request.path === '/api/leads')?.body).toEqual({ business, channel: 'WHATSAPP' });
    await render(); // Different component tree remounts the transient lookup.
    await page.getByRole('button', { name: 'Testar telefone no Maps' }).waitFor();
    expect(await page.getByText('Telefone encontrado — conferir', { exact: true }).count()).toBe(0);
  });
});
