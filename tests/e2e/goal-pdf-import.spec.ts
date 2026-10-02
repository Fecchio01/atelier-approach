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

test('imports, reviews, edits, and persists PDF goals independently in weekly and monthly cycles', async ({ page }) => {
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

    const weeklyPanel = page.getByRole('tabpanel', { name: 'Semanal' });
    const monthlyPanel = page.getByRole('tabpanel', { name: 'Mensal' });
    const weeklyFile = weeklyPanel.locator('input[type="file"]');
    await weeklyFile.setInputFiles({ name: 'metas-semana.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(weeklyPanel.getByLabel('Meta sugerida 1')).toHaveValue('25');
    await expect(weeklyPanel.getByLabel('Nome sugerido 2')).toHaveValue('Carros');
    await expect(weeklyPanel.getByLabel('Progresso sugerido 2')).toHaveValue('1');
    await weeklyPanel.getByLabel('Meta sugerida 1').fill('41');
    await weeklyPanel.getByLabel('Progresso sugerido 2').fill('2');
    await weeklyPanel.getByRole('button', { name: 'Aplicar sugestões revisadas' }).click();
    await expect(weeklyPanel.getByText('Sugestões aplicadas ao formulário', { exact: false })).toBeVisible();
    await expect(weeklyPanel.getByLabel('Meta do indicador 1')).toHaveValue('3');
    await weeklyPanel.getByLabel('Meta do indicador 1').fill('5');
    await weeklyPanel.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(weeklyPanel.getByText('Meta semanal da equipe salva', { exact: false })).toBeVisible();

    const weeklyGoal = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'WEEKLY' } });
    expect(weeklyGoal?.approachesTarget).toBe(41);
    expect(weeklyGoal?.customGoals).toMatchObject([{ name: 'Carros', unit: 'carros', target: 5, current: 2, icon: 'car' }]);
    await expect(weeklyPanel.getByLabel('Progresso do indicador 1')).toHaveValue('2');

    await page.getByRole('tab', { name: 'Mensal' }).click();
    await monthlyPanel.getByLabel('Dia de início do ciclo mensal').fill('14');
    await monthlyPanel.locator('input[type="file"]').setInputFiles({ name: 'metas-mes.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(monthlyPanel.getByLabel('Meta sugerida 1')).toHaveValue('25');
    await monthlyPanel.getByLabel('Meta sugerida 1').fill('90');
    await monthlyPanel.getByRole('button', { name: 'Aplicar sugestões revisadas' }).click();
    await monthlyPanel.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(monthlyPanel.getByText('Meta mensal da equipe salva', { exact: false })).toBeVisible();

    const monthlyGoal = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'MONTHLY' } });
    expect(monthlyGoal?.approachesTarget).toBe(90);
    expect(monthlyGoal?.customGoals).toMatchObject([{ name: 'Carros', target: 3, current: 1 }]);

    await page.reload();
    const reloadedWeeklyPanel = page.getByRole('tabpanel', { name: 'Semanal' });
    await reloadedWeeklyPanel.getByRole('button', { name: 'Editar meta para abordagens' }).click();
    await expect(reloadedWeeklyPanel.getByRole('spinbutton', { name: 'Meta para abordagens' })).toHaveValue('41');
    await expect(reloadedWeeklyPanel.getByLabel('Meta do indicador 1')).toHaveValue('5');
    await expect(reloadedWeeklyPanel.getByLabel('Progresso do indicador 1')).toHaveValue('2');
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
