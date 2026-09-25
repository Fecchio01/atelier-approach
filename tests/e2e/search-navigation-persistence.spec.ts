import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('keeps loaded prospects, filters and scroll position when navigating away and back', async ({ page }) => {
  let searchRequests = 0;
  await page.route('**/api/search?**', async (route) => {
    searchRequests += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        searchId: 'navigation-search', hasMore: false,
        businesses: Array.from({ length: 45 }, (_, index) => ({
          osmId: `overture/navigation-${index}`,
          name: `Oficina ${String(index + 1).padStart(2, '0')}`,
          source: 'Overture', category: 'automotive_repair',
          phone: null, website: null, instagram: null, whatsapp: null
        }))
      })
    });
  });

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await page.goto('/pesquisa');
  await page.getByLabel('Região / estado').selectOption('São Paulo, SP');
  await page.getByLabel('Cidade (opcional)').fill('Campinas');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await expect(page.getByText('45 prospects novos, em ordem de prioridade.')).toBeVisible();
  await page.getByRole('heading', { name: 'Oficina 40' }).scrollIntoViewIfNeeded();
  const savedScrollY = await page.evaluate(() => window.scrollY);
  expect(savedScrollY).toBeGreaterThan(300);

  await page.getByRole('link', { name: 'Funil' }).click();
  await expect(page).toHaveURL(/\/crm$/);
  await page.getByRole('link', { name: 'Empresas' }).click();
  await expect(page).toHaveURL(/\/pesquisa$/);
  await expect(page.getByText('45 prospects novos, em ordem de prioridade.')).toBeVisible();
  await expect(page.getByLabel('Região / estado')).toHaveValue('São Paulo, SP');
  await expect(page.getByLabel('Cidade (opcional)')).toHaveValue('Campinas');
  expect(searchRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(savedScrollY - 100);
});

test('removes an approached prospect from the saved research list', async ({ page }) => {
  let searchRequests = 0;
  await page.route('**/api/search?**', async (route) => {
    searchRequests += 1;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      searchId: 'approached-search', hasMore: false, businesses: [
        { osmId: 'overture/approached', name: 'Oficina Abordada', source: 'Overture', phone: null, website: null, instagram: null, whatsapp: null },
        { osmId: 'overture/pending', name: 'Oficina Pendente', source: 'Overture', phone: null, website: null, instagram: null, whatsapp: null }
      ]
    }) });
  });
  await page.route('**/api/leads', async (route) => route.fulfill({
    status: 201, contentType: 'application/json', body: JSON.stringify({ lead: { id: 'approached-test' } })
  }));

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await page.goto('/pesquisa');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  const approachedCard = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Oficina Abordada' }) });
  await approachedCard.getByRole('button', { name: 'Marcar como abordada' }).click();
  await approachedCard.getByRole('button', { name: 'Salvar abordagem' }).click();
  await expect(page).toHaveURL(/\/crm$/);

  await page.getByRole('link', { name: 'Empresas' }).click();
  await expect(page.getByText('1 prospect novo, em ordem de prioridade.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Oficina Abordada' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Oficina Pendente' })).toBeVisible();
  expect(searchRequests).toBe(1);
});
