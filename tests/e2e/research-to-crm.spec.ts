import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('moves a researched company into the shared CRM', async ({ page }) => {
  await page.route('**/api/search**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        businesses: [
          {
            osmId: 'node/e2e-auto-brilho',
            name: 'Auto Brilho',
            phone: '(19) 99999-0000',
            website: null,
            instagram: null
          }
        ]
      })
    });
  });

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');

  await page.goto('/pesquisa');
  await page.getByLabel('Nicho').fill('estética automotiva');
  await page.getByLabel('Região').fill('Campinas, SP');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page.getByRole('button', { name: 'Marcar como abordada' }).click();
  await page.getByLabel('Canal').selectOption('WHATSAPP');
  await page.getByRole('button', { name: 'Salvar abordagem' }).click();

  await expect(page).toHaveURL(/\/crm/);
  await expect(page.getByText('Auto Brilho')).toBeVisible();
});
