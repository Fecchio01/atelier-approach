import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('shows the complete operational dashboard with branded navigation and funnel stages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await expect(page.getByRole('heading', { name: 'Visão operacional' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Marca Atelier Approach' })).toBeVisible();
  await expect(page.getByText('Mais oficinas. Mais negócios.', { exact: true })).toHaveCount(0);
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
  const goalEditLinks = page.getByRole('link', { name: 'Editar metas' });
  await expect(goalEditLinks).toHaveCount(2);
  await expect(goalEditLinks.first().locator('svg')).toHaveCount(1);
  await expect(page.getByText('↗', { exact: true })).toHaveCount(0);

  const periodNavigation = page.getByRole('navigation', { name: 'Período do dashboard' });
  for (const [label, href, periodLabel] of [
    ['Hoje', '/?period=day', 'hoje'],
    ['Semana', '/?period=week', 'esta semana'],
    ['Ciclo mensal', '/?period=month', 'este ciclo mensal']
  ]) {
    const periodLink = periodNavigation.getByRole('link', { name: label });
    await expect(periodLink).toHaveAttribute('href', href);
    await periodLink.click();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
    await expect(page.getByText(`Indicadores registrados no CRM para ${periodLabel}.`)).toBeVisible();
  }

  const teamPanel = page.getByRole('heading', { name: 'Desempenho da equipe' }).locator('xpath=../../..');
  const personalPanel = page.getByRole('heading', { name: 'Meu desempenho' }).locator('xpath=../../..');
  const [teamBounds, personalBounds] = await Promise.all([teamPanel.boundingBox(), personalPanel.boundingBox()]);
  expect(personalBounds?.width).toBeGreaterThanOrEqual(280);
  expect(Math.abs((teamBounds?.height ?? 0) - (personalBounds?.height ?? 0))).toBeLessThanOrEqual(1);
  for (const stage of ['Novo', 'Abordado', 'Em conversa', 'Qualificado', 'Proposta enviada', 'Follow-up', 'Ganho', 'Sem resposta', 'Descartado']) {
    await expect(page.getByText(stage, { exact: true }).last()).toBeVisible();
  }

  await page.goto('/metas');
  await expect(page.getByRole('heading', { name: 'Meta da equipe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Minha meta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar meta da equipe' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar meta pessoal' })).toBeVisible();
});
