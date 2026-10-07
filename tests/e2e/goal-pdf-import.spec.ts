import { PrismaClient } from '@prisma/client';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

async function makeGoalPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Abordagens: meta 25', { x: 36, y: 760, font, size: 12 });
  page.drawText('Carros: atual 1, meta 3 carros', { x: 36, y: 738, font, size: 12 });
  return Buffer.from(await pdf.save());
}

test('automatically applies PDF goals, closes the review, and persists weekly and monthly cycles', async ({ page }) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const previousSettings = await prisma.teamGoalSettings.findUnique({ where: { id: 'team' } });
  const pdfBuffer = await makeGoalPdf();

  try {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(e2eCredentials.email);
    await page.getByLabel('Senha').fill(e2eCredentials.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();

    const weeklyPanel = page.locator('#goal-panel-weekly');
    const monthlyPanel = page.locator('#goal-panel-monthly');
    const weeklyFile = weeklyPanel.locator('input[type="file"]');
    await weeklyFile.setInputFiles({ name: 'metas-semana.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(weeklyPanel.getByText('Metas aplicadas e salvas neste ciclo.', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(weeklyPanel.getByLabel('Meta sugerida 1')).toHaveCount(0);

    const importedWeeklyGoal = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'WEEKLY' } });
    expect(importedWeeklyGoal?.approachesTarget).toBe(25);
    expect(importedWeeklyGoal?.customGoals).toMatchObject([{ name: 'Carros', unit: 'carros', target: 3, current: 1, icon: 'car', group: 'vehicles', origin: 'pdf' }]);

    const navigation = page.getByRole('navigation', { name: 'Navegação principal' }).first();
    await navigation.getByRole('link', { name: 'Funil' }).click();
    await expect(page).toHaveURL(/\/crm$/);
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();
    await expect(page).toHaveURL(/\/metas$/);
    const restoredWeeklyPanel = page.locator('#goal-panel-weekly');
    await restoredWeeklyPanel.getByRole('button', { name: 'Editar meta para abordagens' }).click();
    await expect(restoredWeeklyPanel.getByRole('spinbutton', { name: 'Meta para abordagens' })).toHaveValue('25');
    await restoredWeeklyPanel.getByRole('button', { name: 'Editar Carros' }).click();
    await expect(restoredWeeklyPanel.getByLabel('Meta do indicador 1')).toHaveValue('3');
    await expect(restoredWeeklyPanel.getByLabel('Progresso do indicador 1')).toHaveValue('1');

    const weeklyPanelAfterNavigation = page.locator('#goal-panel-weekly');
    await weeklyPanelAfterNavigation.getByLabel('Meta para abordagens').fill('41');
    await weeklyPanelAfterNavigation.getByLabel('Meta do indicador 1').fill('5');
    await weeklyPanelAfterNavigation.getByLabel('Progresso do indicador 1').fill('2');
    await weeklyPanelAfterNavigation.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(weeklyPanelAfterNavigation.getByText('Meta semanal da equipe salva', { exact: false })).toBeVisible();

    const weeklyGoal = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'WEEKLY' } });
    expect(weeklyGoal?.approachesTarget).toBe(41);
    expect(weeklyGoal?.customGoals).toMatchObject([{ name: 'Carros', unit: 'carros', target: 5, current: 2, icon: 'car' }]);
    await expect(weeklyPanel.getByLabel('Progresso do indicador 1')).toHaveValue('2');

    await weeklyPanel.locator('input[type="file"]').setInputFiles({ name: 'metas-semana-atualizada.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(weeklyPanel.getByText('Metas aplicadas e salvas neste ciclo.', { exact: false })).toBeVisible({ timeout: 15_000 });
    const replacedWeeklyGoal = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'WEEKLY' } });
    expect(replacedWeeklyGoal?.approachesTarget).toBe(25);
    expect(replacedWeeklyGoal?.customGoals).toHaveLength(1);
    expect(replacedWeeklyGoal?.customGoals).toMatchObject([{ name: 'Carros', origin: 'pdf' }]);

    await weeklyPanel.getByRole('button', { name: 'Voltar ao padrão' }).click();
    await expect(weeklyPanel.getByRole('status').last()).toContainText('Metas do PDF removidas');
    const resetWeeklyGoal = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'WEEKLY' } });
    expect(resetWeeklyGoal?.approachesTarget).toBe(25);
    expect(resetWeeklyGoal?.customGoals).toEqual([]);

    await page.getByRole('tab', { name: 'Mensal' }).click();
    await monthlyPanel.getByLabel('Dia de início do ciclo mensal').fill('14');
    await monthlyPanel.locator('input[type="file"]').setInputFiles({ name: 'metas-mes.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(monthlyPanel.getByText('Metas aplicadas e salvas neste ciclo.', { exact: false })).toBeVisible({ timeout: 15_000 });

    const importedMonthlyGoal = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'MONTHLY' } });
    expect(importedMonthlyGoal?.approachesTarget).toBe(25);
    expect(importedMonthlyGoal?.customGoals).toMatchObject([{ name: 'Carros', target: 3, current: 1 }]);

    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Funil' }).click();
    await expect(page).toHaveURL(/\/crm$/);
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();
    await expect(page).toHaveURL(/\/metas$/);
    const monthlyPanelAfterNavigation = page.locator('#goal-panel-monthly');
    await expect(page.getByRole('tab', { name: 'Mensal' })).toHaveAttribute('aria-selected', 'true');
    await expect(monthlyPanelAfterNavigation.getByText('Carros', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('E-mail').fill(e2eCredentials.email);
    await page.getByLabel('Senha').fill(e2eCredentials.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();
    await expect(page).toHaveURL(/\/metas$/);
    const monthlyPanelAfterLogin = page.locator('#goal-panel-monthly');
    await expect(page.getByRole('tab', { name: 'Mensal' })).toHaveAttribute('aria-selected', 'true');
    await expect(monthlyPanelAfterLogin.getByText('Carros', { exact: true })).toBeVisible();

    await monthlyPanel.getByRole('button', { name: 'Editar meta para abordagens' }).click();
    await monthlyPanel.getByLabel('Meta para abordagens').fill('90');
    await monthlyPanel.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(monthlyPanel.getByText('Meta mensal da equipe salva', { exact: false })).toBeVisible();

    const monthlyGoal = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'MONTHLY' } });
    expect(monthlyGoal?.approachesTarget).toBe(90);
    expect(monthlyGoal?.customGoals).toMatchObject([{ name: 'Carros', target: 3, current: 1 }]);
    await monthlyPanel.getByRole('button', { name: 'Voltar ao padrão' }).click();
    await expect(monthlyPanel.getByRole('status').last()).toContainText('Metas do PDF removidas');
    const resetMonthlyGoal = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'MONTHLY' } });
    expect(resetMonthlyGoal?.approachesTarget).toBe(90);
    expect(resetMonthlyGoal?.customGoals).toEqual([]);

    await page.reload();
    const reloadedWeeklyPanel = page.locator('#goal-panel-weekly');
    await reloadedWeeklyPanel.getByRole('button', { name: 'Editar meta para abordagens' }).click();
    await expect(reloadedWeeklyPanel.getByRole('spinbutton', { name: 'Meta para abordagens' })).toHaveValue('25');
    await expect(reloadedWeeklyPanel.getByRole('button', { name: 'Voltar ao padrão' })).toHaveCount(0);
  } finally {
    await prisma.goal.deleteMany({ where: { ownerId: '__team__' } });
    if (previousSettings) {
      await prisma.teamGoalSettings.upsert({ where: { id: previousSettings.id }, create: previousSettings, update: { monthlyStartDay: previousSettings.monthlyStartDay } });
    } else {
      await prisma.teamGoalSettings.deleteMany({ where: { id: 'team' } });
    }
    await prisma.$disconnect();
  }
});
