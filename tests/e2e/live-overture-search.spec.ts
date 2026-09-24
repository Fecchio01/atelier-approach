import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test.skip(process.env.RUN_LIVE_SEARCH_E2E !== '1', 'Requires live Overture data');

test('real search shows named Overture places and maps searches by identity, then loads new places', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');

  await page.goto('/pesquisa');
  const firstResponsePromise = page.waitForResponse((response) => response.url().includes('/api/search?') && response.request().method() === 'GET', { timeout: 100_000 });
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  const firstResponse = await firstResponsePromise;
  expect(firstResponse.ok()).toBe(true);
  const first = await firstResponse.json();
  expect(first.businesses.length).toBeGreaterThanOrEqual(5);
  expect(first.hasMore).toBe(true);
  expect(first.businesses.every((business: { source: string }) => business.source === 'Overture')).toBe(true);

  for (const business of first.businesses.slice(0, 5)) {
    expect(business.name).not.toMatch(/nome comercial não informado|^(car wash|oficina mecânica)$/i);
    expect(business.latitude).toBeGreaterThan(-34);
    expect(business.latitude).toBeLessThan(6);
    expect(business.longitude).toBeGreaterThan(-74);
    expect(business.longitude).toBeLessThan(-34);
    const mapLink = page.getByRole('link', { name: `Abrir ${business.name} no Google Maps` }).first();
    await expect(mapLink).toBeVisible();
    const mapUrl = new URL((await mapLink.getAttribute('href'))!);
    expect(mapUrl.searchParams.get('query')).toContain(business.name);
    expect(mapUrl.searchParams.get('query')).not.toBe(`${business.latitude},${business.longitude}`);
  }

  const nextResponsePromise = page.waitForResponse((response) => response.url().includes(`/api/search?searchId=${first.searchId}`), { timeout: 100_000 });
  await page.getByRole('button', { name: 'Carregar mais empresas' }).click();
  const nextResponse = await nextResponsePromise;
  expect(nextResponse.ok()).toBe(true);
  const next = await nextResponse.json();
  expect(next.businesses.length).toBeGreaterThanOrEqual(5);
  const firstIds = new Set(first.businesses.map((business: { osmId: string }) => business.osmId));
  expect(next.businesses.every((business: { osmId: string; source: string }) => business.source === 'Overture' && !firstIds.has(business.osmId))).toBe(true);
  await expect(page.getByText(`${first.businesses.length + next.businesses.length} prospects novos, em ordem de prioridade.`)).toBeVisible();

  await page.getByLabel('Região / estado').selectOption('Rio de Janeiro, RJ');
  const stateResponsePromise = page.waitForResponse((response) => response.url().includes('/api/search?') && new URL(response.url()).searchParams.get('region') === 'Rio de Janeiro, RJ', { timeout: 100_000 });
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  const stateResponse = await stateResponsePromise;
  expect(stateResponse.ok()).toBe(true);
  const state = await stateResponse.json();
  expect(state.businesses.length).toBeGreaterThanOrEqual(5);
  expect(state.hasMore).toBe(true);
  expect(state.businesses.every((business: { source: string; name: string }) => business.source === 'Overture' && business.name !== 'Nome comercial não informado')).toBe(true);
});
