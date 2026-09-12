import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
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
});
