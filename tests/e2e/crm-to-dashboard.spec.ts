import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('shows operational CRM metrics, goals and follow-up queues on the dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await expect(page.getByRole('heading', { name: 'Visão operacional' })).toBeVisible();
  await expect(page.getByText('Receita vendida')).toBeVisible();
  await expect(page.getByText('MRR')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Metas da semana' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Follow-ups vencidos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desempenho da equipe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meu desempenho' })).toBeVisible();
});
