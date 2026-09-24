import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('search cards keep their own height and show a distinct no-photo state', async ({ page }) => {
  await page.route('**/api/search?**', async (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ searchId: 'layout-test', hasMore: false, businesses: [
      { osmId: 'overture/photo', name: 'Oficina Foto', source: 'Overture', category: 'automotive_repair', imageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E', phone: null, website: null, instagram: null, whatsapp: null },
      { osmId: 'overture/plain', name: 'Oficina Sem Foto', source: 'Overture', category: 'automotive_repair', imageUrl: null, phone: null, website: null, instagram: null, whatsapp: null },
      { osmId: 'overture/third', name: 'Terceira Oficina', source: 'Overture', category: 'automotive_repair', imageUrl: null, phone: null, website: null, instagram: null, whatsapp: null }
    ] })
  }));

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await page.goto('/pesquisa');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await expect(page.getByRole('heading', { name: 'Oficina Sem Foto' })).toBeVisible();

  const photoCard = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Oficina Foto' }) });
  const plainCard = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Oficina Sem Foto' }) });
  await expect(plainCard.getByText('Sem foto pública')).toBeVisible();
  await expect(photoCard.locator('img')).toHaveCount(1);

  const before = await plainCard.boundingBox();
  expect(before).not.toBeNull();
  const button = await plainCard.getByRole('button', { name: 'Marcar como abordada' }).boundingBox();
  expect(button).not.toBeNull();
  expect(before!.y + before!.height - (button!.y + button!.height)).toBeLessThan(30);

  await photoCard.getByText('Ver dados e prioridade').click();
  const after = await plainCard.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.height).toBe(before!.height);
});
