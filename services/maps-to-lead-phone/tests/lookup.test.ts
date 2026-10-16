import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { createApp, readConfig } from '../src/server.js';
import { lookupCompany, normalizeBrazilPhone, type MapsPhoneCandidate } from '../src/lookup.js';

const request = { companyName: 'Ateliê Exato', city: 'Belo Horizonte', region: 'MG' };
const candidate = { name: 'Ateliê Exato', phone: '+553133334444', address: 'Rua A, 12, Belo Horizonte - MG', city: 'Belo Horizonte', region: 'MG' };
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))); });

async function serve(lookup: Parameters<typeof createApp>[0]['lookup'] = async () => [candidate]) {
  const server = createApp({ token: 'test-secret', lookup }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No HTTP port');
  return async (body: unknown = request, authorization: string | null = 'Bearer test-secret') => fetch(`http://127.0.0.1:${address.port}/lookup`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body)
  });
}

describe('POST /lookup', () => {
  // Catches removal of auth or accepting a partial/incorrect bearer token.
  it.each([null, 'Bearer wrong', 'Basic test-secret', 'Bearer test-secret extra'])('rejects authorization %s before performing a lookup', async authorization => {
    const post = await serve(async () => { throw new Error('Lookup must not run'); });
    expect((await post(request, authorization)).status).toBe(401);
  });

  // Catches missing field/type/UF validation and upstream webhook/options inputs.
  it.each([{}, { ...request, companyName: ' ' }, { ...request, city: 23 }, { ...request, region: 'XX' }, { ...request, region: 'Minas Gerais' }, { ...request, address: 12 }, { ...request, webhook: { url: 'http://127.0.0.1:1' } }, { ...request, companyName: 'a'.repeat(301) }])('rejects invalid request %j', async body => {
    const post = await serve(async () => { throw new Error('Lookup must not run'); });
    expect((await post(body)).status).toBe(400);
  });

  it('passes normalized input to the lookup and returns only the five candidate fields', async () => {
    const post = await serve(async input => input.companyName === 'Ateliê Exato' && input.region === 'MG' && input.address === null ? [{ ...candidate, whatsapp: '+5531999999999', jobId: 'forbidden' } as MapsPhoneCandidate] : []);
    const response = await post({ ...request, companyName: ' Ateliê Exato ', region: 'mg', address: null });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ candidates: [candidate] });
  });

  it('caps the response at five candidates', async () => {
    const post = await serve(async () => Array.from({ length: 7 }, (_, i) => ({ ...candidate, name: `Company ${i}` })));
    const response = await post();
    expect(response.status).toBe(200);
    expect((await response.json()).candidates.map((value: MapsPhoneCandidate) => value.name)).toEqual(['Company 0', 'Company 1', 'Company 2', 'Company 3', 'Company 4']);
  });

  it('returns current results without caching, writing a result store, or contacting a webhook', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'maps-phone-no-store-'));
    const previousDbPath = process.env.DB_PATH;
    const previousWebhook = process.env.WEBHOOK_URL;
    process.env.DB_PATH = join(directory, 'leads.db');
    let webhookHits = 0;
    const { createServer } = await import('node:http');
    const webhook = createServer((_req, res) => { webhookHits++; res.end(); }).listen(0, '127.0.0.1');
    servers.push(webhook);
    await new Promise<void>(resolve => webhook.once('listening', resolve));
    const address = webhook.address() as { port: number };
    process.env.WEBHOOK_URL = `http://127.0.0.1:${address.port}`;
    try {
      let phone = '+553133334444';
      const post = await serve(async () => [{ ...candidate, phone }]);
      expect(await (await post()).json()).toEqual({ candidates: [candidate] });
      phone = '+553133335555';
      expect(await (await post()).json()).toEqual({ candidates: [{ ...candidate, phone: '+553133335555' }] });
      expect(await readdir(directory)).toEqual([]);
      expect(webhookHits).toBe(0);
    } finally {
      if (previousDbPath === undefined) delete process.env.DB_PATH; else process.env.DB_PATH = previousDbPath;
      if (previousWebhook === undefined) delete process.env.WEBHOOK_URL; else process.env.WEBHOOK_URL = previousWebhook;
      await rm(directory, { recursive: true });
    }
  });

  it('returns a sanitized upstream error synchronously', async () => {
    const post = await serve(async () => { throw new Error('private upstream detail'); });
    const response = await post();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Maps lookup failed' });
  });
});

describe('startup configuration', () => {
  it.each([undefined, '', '   '])('fails startup without a token (%s)', token => {
    expect(() => readConfig({ MAPS_PHONE_SERVICE_TOKEN: token })).toThrow(/MAPS_PHONE_SERVICE_TOKEN/);
  });
  it('uses PORT and the configured bearer token', () => {
    expect(readConfig({ PORT: '9876', MAPS_PHONE_SERVICE_TOKEN: 'secret' })).toEqual({ port: 9876, token: 'secret' });
  });
  it.each(['0', '65536', '9000x'])('rejects invalid PORT %s', port => {
    expect(() => readConfig({ PORT: port, MAPS_PHONE_SERVICE_TOKEN: 'secret' })).toThrow(/PORT/);
  });
});

describe('Brazil phone normalization', () => {
  it.each([
    ['(31) 3333-4444', '+553133334444'], ['+55 (11) 99999-8888', '+5511999998888'],
    ['5531999998888', '+5531999998888'], ['(55) 3222-4444', '+555532224444'],
    ['0800 123 4567', null], ['+55 800 1234567', null], ['(20) 3333-4444', null],
    ['(10) 99999-8888', null], ['(90) 3333-4444', null], ['3333-4444', null],
    ['+1 212 333 4444', null], ['(31) 1234-5678', null], ['(31) 88888-7777', null]
  ])('normalizes %s to %s', (raw, want) => { expect(normalizeBrazilPhone(raw)).toBe(want); });
});

// Only Google Maps network responses are replaced: real Chromium, DOM extraction,
// navigation and owned browser/context cleanup remain under test.
async function mapsFixture(mode: 'feed' | 'direct' | 'empty' | 'broken' | 'delayed' | 'no-results' = 'feed') {
  let browser: Browser | undefined;
  const contexts: BrowserContext[] = [];
  let closed = 0;
  const visited: string[] = [];
  const queries: string[] = [];
  let scrolls = 0;
  const launch = async () => {
    browser = await chromium.launch({ headless: true });
    const originalNewContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await originalNewContext(options);
      contexts.push(context);
      context.on('close', () => closed++);
      await context.exposeFunction('recordScroll', () => { scrolls++; });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/maps/place/')) {
          visited.push(url.pathname);
          const index = Number(url.pathname.split('/').pop());
          if (mode === 'broken') return route.abort();
          return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<h1>Ateliê ${index}</h1><button data-item-id="address" aria-label="Endereço: Rua A, 12 - Centro, Belo Horizonte - MG, 30100-000, Brasil"></button>${index === 2 ? '<a href="tel:+5531999998888">Ligar</a>' : `<button data-item-id="phone:tel:${index === 3 ? '+552033334444' : '+553133334444'}" aria-label="WhatsApp"></button>`}` });
        }
        queries.push(url.searchParams.get('q') || '');
        if (mode === 'delayed') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<div role="main"><div role="feed" id="root"></div></div><script>setTimeout(() => { document.getElementById('root').innerHTML = '<a href="https://www.google.com/maps/place/0">Lugar</a>'; }, 100);</script>` });
        if (mode === 'no-results') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<div role="main">O Google Maps não encontrou resultados para esta pesquisa.</div>' });
        if (mode === 'direct') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>Resultado único</h1><button data-item-id="address" aria-label="Endereço: Av. Brasil, 100, São Paulo - SP, 01000-000"></button><button data-item-id="phone:tel:+551133334444"></button>' });
        if (mode === 'empty') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<div role="feed">Nenhum resultado</div>' });
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<div role="feed"><a style="display:none" href="https://www.google.com/maps/place/hidden">Oculto</a><a href="https://www.google.com/maps/place/0">Duplicado</a>${Array.from({ length: 7 }, (_, i) => `<a href="https://www.google.com/maps/place/${i}" aria-label="Ateliê ${i}">Lugar ${i}</a>`).join('')}</div><script>document.querySelector('[role=feed]').addEventListener('scroll',()=>window.recordScroll());</script>` });
      });
      return context;
    };
    return browser;
  };
  return { launch, contexts, visited, queries, get closed() { return closed; }, get scrolls() { return scrolls; }, get connected() { return browser?.isConnected(); } };
}

describe('Maps detail extraction', () => {
  it('waits for asynchronous results after the main container appears', async () => {
    const fixture = await mapsFixture('delayed');
    expect(await lookupCompany(request, fixture.launch)).toEqual([{ name: 'Ateliê 0', phone: '+553133334444', address: 'Rua A, 12 - Centro, Belo Horizonte - MG, 30100-000, Brasil', city: 'Belo Horizonte', region: 'MG' }]);
    expect(fixture.closed).toBe(1);
  });

  it('returns an empty result for the explicit Maps no-results message', async () => {
    const fixture = await mapsFixture('no-results');
    expect(await lookupCompany(request, fixture.launch)).toEqual([]);
    expect(fixture.closed).toBe(1);
  });

  it('queries the exact company and location, reads only five visible unique results and parses detail locality', async () => {
    const fixture = await mapsFixture();
    const post = await serve(input => lookupCompany(input, fixture.launch));
    const response = await post();
    expect(response.status).toBe(200);
    const { candidates } = await response.json();
    expect(fixture.queries).toEqual(['"Ateliê Exato" Belo Horizonte MG']);
    expect(fixture.visited).toEqual(['/maps/place/0', '/maps/place/1', '/maps/place/2', '/maps/place/3', '/maps/place/4']);
    expect(candidates).toEqual([0, 1, 2, 4].map(index => ({ name: `Ateliê ${index}`, phone: index === 2 ? '+5531999998888' : '+553133334444', address: 'Rua A, 12 - Centro, Belo Horizonte - MG, 30100-000, Brasil', city: 'Belo Horizonte', region: 'MG' })));
    expect(fixture.contexts).toHaveLength(1);
    expect(fixture.closed).toBe(1);
    expect(fixture.connected).toBe(false);
    expect(fixture.scrolls).toBe(0);
  });

  it('extracts a direct place result without needing a feed', async () => {
    const fixture = await mapsFixture('direct');
    expect(await lookupCompany(request, fixture.launch)).toEqual([{ name: 'Resultado único', phone: '+551133334444', address: 'Av. Brasil, 100, São Paulo - SP, 01000-000', city: 'São Paulo', region: 'SP' }]);
    expect(fixture.closed).toBe(1);
  });

  it('returns no candidates for an empty result feed', async () => {
    const fixture = await mapsFixture('empty');
    expect(await lookupCompany(request, fixture.launch)).toEqual([]);
    expect(fixture.closed).toBe(1);
  });

  it('closes the context and browser even when detail navigation fails', async () => {
    const fixture = await mapsFixture('broken');
    await expect(lookupCompany(request, fixture.launch)).rejects.toThrow();
    expect(fixture.closed).toBe(1);
    expect(fixture.connected).toBe(false);
  });
});
