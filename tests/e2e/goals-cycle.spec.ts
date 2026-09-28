import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('weekly and monthly goal tabs keep separate drafts and save their team targets', async ({ page }) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const previousSettings = await prisma.teamGoalSettings.findUnique({ where: { id: 'team' } });

  try {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(e2eCredentials.email);
    await page.getByLabel('Senha').fill(e2eCredentials.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3001/', { timeout: 15_000 });

    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3001/metas');

    const weeklyTab = page.getByRole('tab', { name: 'Semanal' });
    const monthlyTab = page.getByRole('tab', { name: 'Mensal' });
    const weeklyPanel = page.getByRole('tabpanel', { name: 'Semanal' });
    const monthlyPanel = page.getByRole('tabpanel', { name: 'Mensal' });

    await expect(weeklyTab).toHaveAttribute('aria-selected', 'true');
    await weeklyPanel.getByLabel('Meta para abordagens').fill('321');
    await monthlyTab.click();
    await expect(monthlyTab).toHaveAttribute('aria-selected', 'true');
    await monthlyPanel.getByLabel('Dia de início do ciclo mensal').fill('14');
    await monthlyPanel.getByLabel('Meta para abordagens').fill('777');
    await monthlyPanel.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(monthlyPanel.getByRole('status')).toContainText('Meta mensal da equipe salva');

    const monthlyGoal = await prisma.goal.findFirst({
      where: { ownerId: '__team__', periodKind: 'MONTHLY' },
      orderBy: { periodStart: 'desc' }
    });
    expect(monthlyGoal?.approachesTarget).toBe(777);
    expect((await prisma.teamGoalSettings.findUnique({ where: { id: 'team' } }))?.monthlyStartDay).toBe(14);

    await weeklyTab.click();
    await expect(weeklyPanel.getByLabel('Meta para abordagens')).toHaveValue('321');
    await weeklyPanel.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(weeklyPanel.getByRole('status')).toContainText('Meta semanal da equipe salva');

    const weeklyGoal = await prisma.goal.findFirst({
      where: { ownerId: '__team__', periodKind: 'WEEKLY' },
      orderBy: { periodStart: 'desc' }
    });
    expect(weeklyGoal?.approachesTarget).toBe(321);
  } finally {
    await prisma.goal.deleteMany({ where: { ownerId: '__team__' } });
    if (previousSettings) {
      await prisma.teamGoalSettings.upsert({
        where: { id: previousSettings.id },
        create: previousSettings,
        update: { monthlyStartDay: previousSettings.monthlyStartDay }
      });
    } else {
      await prisma.teamGoalSettings.deleteMany({ where: { id: 'team' } });
    }
    await prisma.$disconnect();
  }
});
