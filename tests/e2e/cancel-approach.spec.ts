import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('cancels an approach without saving or leaving the company card', async ({ page }) => {
  let saves = 0;
  await page.route('**/api/search?**', async (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ searchId: 'cancel-test', hasMore: false, businesses: [{
      osmId: 'overture/cancel-test', name: 'Oficina Teste', category: 'automotive_repair',
      source: 'Overture', phone: null, website: null, instagram: null, whatsapp: null,
      latitude: -22.9, longitude: -43.2
    }] })
  }));
  await page.route('**/api/leads', async (route) => { saves += 1; await route.abort(); });

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await page.goto('/pesquisa');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page.getByRole('button', { name: 'Marcar como abordada' }).click();
  await expect(page.getByRole('button', { name: 'Salvar abordagem' })).toBeVisible();
  await expect(page.getByLabel('Nota da abordagem')).toHaveCount(0);

  await page.getByRole('button', { name: 'Cancelar abordagem' }).click();

  await expect(page.getByRole('button', { name: 'Salvar abordagem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Marcar como abordada' })).toBeVisible();
  await expect(page.getByText('Oficina Teste')).toBeVisible();
  expect(saves).toBe(0);
});
