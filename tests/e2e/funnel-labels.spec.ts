import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('shows the Portuguese funnel stage names in the report table', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/', { timeout: 15_000 });

  await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Relatórios' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/relatorios');

  const funnelTable = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Funil atual' }) }).getByRole('table');
  for (const stageName of ['Abordado', 'Em conversa', 'Qualificado', 'Proposta enviada', 'Reunião', 'Follow-up', 'Ganho', 'Sem resposta', 'Descartado']) {
    await expect(funnelTable.getByRole('cell', { name: stageName, exact: true })).toBeVisible();
  }
  await expect(funnelTable.getByText('CONTACTED', { exact: true })).toHaveCount(0);
  await expect(funnelTable.getByRole('cell', { name: 'Novo', exact: true })).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('progressbar', { name: 'Leads em Reunião', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Leads em Novo', exact: true })).toHaveCount(0);
  await page.goto('/crm');
  const columns = page.getByRole('region', { name: 'Funil CRM', exact: true });
  await expect(columns.getByRole('heading')).toHaveText(['Abordado', 'Em conversa', 'Qualificado', 'Proposta enviada', 'Reunião', 'Follow-up', 'Ganho']);
  await expect(columns.getByRole('heading', { name: 'Novo', exact: true })).toHaveCount(0);
});
