import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('shows the complete operational dashboard with branded navigation and funnel stages', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await expect(page.getByRole('heading', { name: 'Visão operacional' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Marca Atelier Approach' })).toBeVisible();
  const primaryNavigation = page.getByRole('navigation', { name: 'Navegação principal' }).first();
  for (const label of ['Painel', 'Funil', 'Empresas', 'Metas', 'Relatórios']) {
    await expect(primaryNavigation.getByRole('link', { name: label }).locator('svg')).toHaveCount(1);
  }
  for (const label of ['Receita vendida', 'MRR', 'Abordagens', 'Interesses', 'Reuniões / retornos', 'Follow-ups concluídos']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Meta semanal da equipe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meta do ciclo mensal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Follow-ups' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Funil atual' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desempenho da equipe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Meu desempenho' })).toBeVisible();
  for (const stage of ['Novo', 'Abordado', 'Em conversa', 'Qualificado', 'Proposta enviada', 'Follow-up', 'Ganho', 'Sem resposta', 'Descartado']) {
    await expect(page.getByText(stage, { exact: true }).last()).toBeVisible();
  }

  await page.goto('/metas');
  await expect(page.getByRole('heading', { name: 'Meta da equipe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Minha meta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar meta da equipe' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar meta pessoal' })).toBeVisible();
});
