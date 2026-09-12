import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

async function signIn(page: import('@playwright/test').Page, credentials: Pick<typeof e2eCredentials, 'email' | 'password'> = e2eCredentials) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(credentials.email);
  await page.getByLabel('Senha').fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');
}

test('communicates an unavailable OpenStreetMap search accessibly', async ({ page }) => {
  await page.route('**/api/search**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'A pesquisa está indisponível no momento. Tente novamente em alguns instantes.' })
    });
  });

  await signIn(page);
  await page.goto('/pesquisa');
  await page.getByLabel('Nicho').fill('marcenaria');
  await page.getByLabel('Região').fill('Campinas, SP');
  await page.getByRole('button', { name: 'Pesquisar' }).click();

  await expect(page.locator('p[role="alert"]')).toHaveText('A pesquisa está indisponível no momento. Tente novamente em alguns instantes.');
  await expect(page.getByText('Nenhum novo prospect encontrado para esta busca.')).not.toBeVisible();
});

test('renders missing external contact data and helpful empty-search guidance', async ({ page }) => {
  await page.route('**/api/search**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ businesses: [{ osmId: 'node/missing-contacts', name: 'Sem contatos', phone: null, website: null, instagram: null }] })
    });
  });

  await signIn(page);
  await page.goto('/pesquisa');
  await page.getByLabel('Nicho').fill('marcenaria');
  await page.getByLabel('Região').fill('Campinas, SP');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await expect(page.getByText('Não informado')).toHaveCount(3);
});

test('suggests refinements when a successful search returns no companies', async ({ page }) => {
  await page.route('**/api/search**', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ businesses: [] }) });
  });

  await signIn(page);
  await page.goto('/pesquisa');
  await page.getByLabel('Nicho').fill('marcenaria');
  await page.getByLabel('Região').fill('Campinas, SP');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await expect(page.getByText('Tente ampliar o raio (até 50 km) ou usar outro termo e categoria.')).toBeVisible();
});

test('lets two members share an overdue follow-up and close it with revenue values', async ({ page, browser }) => {
  const suffix = randomUUID();
  const businessName = `Oficina compartilhada ${suffix.slice(0, 8)}`;
  await page.route('**/api/search**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ businesses: [{ osmId: `node/acceptance-${suffix}`, name: businessName, phone: null, website: null, instagram: null }] })
    });
  });

  await signIn(page);
  await page.goto('/pesquisa');
  await page.getByLabel('Nicho').fill('oficina');
  await page.getByLabel('Região').fill('Campinas, SP');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page.getByRole('button', { name: 'Marcar como abordada' }).click();
  await page.getByRole('button', { name: 'Salvar abordagem' }).click();

  const lead = page.locator('[data-lead-id]').filter({ hasText: businessName });
  await lead.getByLabel('Data do follow-up').fill(new Date(Date.now() - 86_400_000).toISOString().slice(0, 16));
  await lead.getByRole('button', { name: 'Agendar follow-up' }).click();
  await expect(lead.getByText('Retorno vencido')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Follow-ups vencidos' })).toBeVisible();
  await expect(page.getByText(businessName)).toBeVisible();
  const revenue = page.locator('article').filter({ has: page.getByText('Receita vendida') }).locator('p').nth(1);
  const mrr = page.locator('article').filter({ has: page.getByText('MRR') }).locator('p').nth(1);
  const revenueBeforeClosing = await revenue.innerText();
  const mrrBeforeClosing = await mrr.innerText();

  const secondPage = await browser.newPage();
  await signIn(secondPage, e2eCredentials.secondary);
  await secondPage.goto('/crm');
  await expect(secondPage.getByText(businessName)).toBeVisible();
  await secondPage.close();

  await page.goto('/crm');
  await lead.getByLabel('Valor da venda').fill('1500');
  await lead.getByLabel('MRR').fill('300');
  await lead.getByRole('button', { name: 'Fechar negócio' }).click();
  await page.goto('/');
  await expect(revenue).not.toHaveText(revenueBeforeClosing);
  await expect(mrr).not.toHaveText(mrrBeforeClosing);
});

test('takes a duplicate approach to its existing CRM record with a clear notice', async ({ page }) => {
  await page.route('**/api/search**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        businesses: [{ osmId: 'node/acceptance-duplicate', name: 'Empresa duplicada', phone: null, website: null, instagram: null }]
      })
    });
  });
  await page.route('**/api/leads', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Esta empresa já está no CRM.', href: '/crm?lead=acceptance-duplicate' })
    });
  });

  await signIn(page);
  await page.goto('/pesquisa');
  await page.getByLabel('Nicho').fill('marcenaria');
  await page.getByLabel('Região').fill('Campinas, SP');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page.getByRole('button', { name: 'Marcar como abordada' }).click();
  await page.getByRole('button', { name: 'Salvar abordagem' }).click();

  await expect(page).toHaveURL(/\/crm\?lead=acceptance-duplicate/);
  await expect(page.locator('p[role="alert"]')).toHaveText('Esta empresa já está no CRM.');
});

test('keeps the operational dashboard usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);

  await expect(page.getByRole('heading', { name: 'Visão operacional' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Follow-ups vencidos' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pesquisa' })).toBeVisible();
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBeTruthy();
});
