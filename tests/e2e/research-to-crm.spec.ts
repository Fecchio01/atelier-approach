import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('moves a researched company into the shared CRM', async ({ page }) => {
  const suffix = randomUUID();
  const businessName = `Auto Brilho ${suffix.slice(0, 8)}`;
  const osmId = `node/e2e-auto-brilho-${suffix}`;

  await page.route('**/api/search**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        businesses: [
          {
            osmId,
            name: businessName,
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
  await expect(page.getByText(businessName)).toBeVisible();

  const leadCard = page.locator('[data-lead-id]').filter({ hasText: businessName });
  await leadCard.getByLabel('Mover para').selectOption('INTEREST');
  await expect(leadCard.getByText('Etapa alterada para INTEREST.')).toBeVisible();
  await expect(leadCard.getByText('Abordagem iniciada a partir da pesquisa.')).toBeVisible();

  await page.goto('/pesquisa');
  await page.getByLabel('Nicho').fill('estética automotiva');
  await page.getByLabel('Região').fill('Campinas, SP');
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await page.getByRole('button', { name: 'Marcar como abordada' }).click();
  await page.getByRole('button', { name: 'Salvar abordagem' }).click();

  await expect(page).toHaveURL(/\/crm\?lead=/);
  await expect(leadCard).toBeFocused();
});
