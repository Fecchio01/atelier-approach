import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

import { e2eCredentials } from './credentials';

const experimentalPhone = '+5519998887766';
const officialPhone = '+551932224444';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).searchParams.get('schema') !== 'atelier_test') {
  throw new Error('Phone lookup regression requires the isolated atelier_test schema.');
}
const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

test.afterAll(async () => { await database.$disconnect(); });

// Compare every stored value, including metric/report/goal inputs, without depending
// on the generated client's default column selection for the existing test schema.
async function storedBusinessState() {
  return database.$queryRaw`
    SELECT jsonb_build_object(
      'leads', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "Lead" t),
      'activities', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "Activity" t),
      'history', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "StageHistory" t),
      'followUps', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "FollowUp" t),
      'sales', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "SaleEvent" t),
      'saleItems', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "SaleLineItem" t),
      'goals', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "Goal" t),
      'reports', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "DailyReport" t),
      'imports', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "MetricImportBatch" t),
      'importRows', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]') FROM "MetricImportRow" t)
    ) AS snapshot
  `;
}

async function openResearch(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/pesquisa');
  await page.getByLabel('Nicho', { exact: true }).fill('oficina');
  await page.getByLabel('Nome da empresa (opcional)').fill('Oficina');
  await page.getByLabel('Região / estado').selectOption('São Paulo, SP');
  await page.getByLabel('Cidade (opcional)').fill('Campinas');
  await page.getByLabel('Mostrar empresas já trabalhadas').check();
}

for (const scenario of [
  { title: 'matched experimental phone preserves official contact', status: 'matched', phone: officialPhone },
  { title: 'matched experimental phone never fills an empty CRM contact', status: 'matched', phone: null },
  { title: 'rejected Maps identity leaves search and CRM contact unchanged', status: 'none', phone: null }
] as const) {
  test(scenario.title, async ({ page }) => {
    test.setTimeout(90_000);
    const business = {
      osmId: 'overture/phone-isolation-primary', name: 'Oficina Horizonte',
      source: 'Overture', category: 'automotive_repair', categoryHierarchy: 'automotive',
      phone: scenario.phone, phoneSource: scenario.phone ? 'site oficial verificado' : null,
      website: 'https://oficinahorizonte.example', instagram: 'oficinahorizonte', whatsapp: null,
      address: 'Rua das Flores, 100, Campinas, SP', latitude: -22.9, longitude: -47.06,
      imageUrl: null, alreadyWorked: false, crmHref: null, lastSyncedAt: '2026-10-16T12:00:00.000Z'
    };
    const searchRequests: string[] = [];
    const lookupBodies: unknown[] = [];
    const crmBodies: unknown[] = [];
    const mutations: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/') && !path.startsWith('/api/auth/') && request.method() !== 'GET') {
        mutations.push(`${request.method()} ${path}`);
      }
    });
    await page.route('**/api/search?**', async (route) => {
      searchRequests.push(route.request().url());
      await route.fulfill({ json: {
        searchId: 'phone-isolation-search', hasMore: false,
        businesses: [business, {
          osmId: 'overture/phone-isolation-secondary', name: 'Oficina Vila Nova', source: 'Overture',
          phone: null, website: null, instagram: null, whatsapp: null,
          address: 'Rua das Flores, 200, Campinas, SP', category: 'automotive_repair',
          latitude: -22.91, longitude: -47.07
        }]
      } });
    });
    await page.route('**/api/research/phone-lookup', async (route) => {
      lookupBodies.push(route.request().postDataJSON());
      // The proxy's identity rejection is covered by route tests. Here its `none`
      // response proves the UI keeps the rejected candidate out of the contact/CRM.
      await route.fulfill({ json: scenario.status === 'matched' ? {
        status: 'matched', candidate: {
          name: 'Oficina Horizonte', phone: experimentalPhone,
          address: 'Rua das Flores, 100, Campinas, SP', city: 'Campinas', region: 'SP'
        }
      } : { status: 'none' } });
    });
    await page.route('**/api/leads', async (route) => {
      crmBodies.push(route.request().postDataJSON());
      // Exercise the real card's payload without inserting a fixture into CRM.
      await route.fulfill({ status: 422, json: { error: 'Gravação interceptada pelo teste.' } });
    });

    await openResearch(page);
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
    await expect(page.getByText('2 prospects novos, em ordem de prioridade.')).toBeVisible();
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Oficina Horizonte', exact: true }) });
    await expect(card.getByText('Fonte: Overture')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(2);
    expect(lookupBodies).toEqual([]);
    expect(mutations).toEqual([]);
    const beforeLookup = await storedBusinessState();

    await card.getByRole('button', { name: 'Testar telefone no Maps' }).click();
    if (scenario.status === 'matched') {
      await expect(card.getByText('Telefone encontrado — conferir')).toBeVisible();
      await expect(card.getByText('WhatsApp não confirmado')).toBeVisible();
      await expect(card.getByRole('link', { name: 'Ligar para o telefone encontrado no Maps' })).toHaveAttribute('href', `tel:${experimentalPhone}`);
    } else {
      await expect(card.getByText('Nenhum telefone confirmado para esta empresa.')).toBeVisible();
      await expect(card.locator(`a[href="tel:${experimentalPhone}"]`)).toHaveCount(0);
      await expect(card.getByText('Telefone encontrado — conferir')).toHaveCount(0);
    }
    expect(lookupBodies).toEqual([{ business: {
      name: 'Oficina Horizonte', address: 'Rua das Flores, 100, Campinas, SP', city: 'Campinas', region: 'SP'
    } }]);
    expect(mutations).toEqual(['POST /api/research/phone-lookup']);
    expect(crmBodies).toEqual([]);
    expect(await storedBusinessState()).toEqual(beforeLookup);
    await expect(page.getByText('2 prospects novos, em ordem de prioridade.')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(2);
    await expect(page.getByLabel('Nicho', { exact: true })).toHaveValue('oficina');
    await expect(page.getByLabel('Nome da empresa (opcional)')).toHaveValue('Oficina');
    await expect(page.getByLabel('Região / estado')).toHaveValue('São Paulo, SP');
    await expect(page.getByLabel('Cidade (opcional)')).toHaveValue('Campinas');
    await expect(page.getByLabel('Mostrar empresas já trabalhadas')).toBeChecked();
    expect(searchRequests).toHaveLength(1);
    expect(Object.fromEntries(new URL(searchRequests[0]).searchParams)).toEqual({
      niche: 'oficina', businessName: 'Oficina', country: 'BR', region: 'São Paulo, SP',
      city: 'Campinas', includeWorked: 'true', national: 'false'
    });
    if (scenario.phone) {
      await expect(card.getByRole('link', { name: 'Ligar para Oficina Horizonte', exact: true })).toHaveAttribute('href', `tel:${officialPhone}`);
      await card.getByText('Ver dados e prioridade').click();
      await expect(card.getByText('Publicado no site oficial verificado')).toBeVisible();
    } else {
      await expect(card.getByRole('link', { name: 'Ligar para Oficina Horizonte', exact: true })).toHaveCount(0);
    }

    await card.getByRole('button', { name: 'Marcar como abordada' }).click();
    await card.getByLabel('Canal').selectOption('PHONE');
    await card.getByRole('button', { name: 'Salvar abordagem' }).click();
    await expect(card.getByRole('alert')).toHaveText('Gravação interceptada pelo teste.');
    expect(crmBodies).toEqual([{ business: {
      ...business, score: scenario.phone ? 15 : 35, reasons: scenario.phone ? [] : ['Sem telefone cadastrado']
    }, channel: 'PHONE' }]);
    expect(JSON.stringify(crmBodies)).not.toContain(experimentalPhone);
    expect(mutations).toEqual(['POST /api/research/phone-lookup', 'POST /api/leads']);
    expect(await storedBusinessState()).toEqual(beforeLookup);
  });
}
