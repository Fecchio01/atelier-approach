import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('weekly and monthly goal tabs keep separate drafts and save their team targets', async ({ page }) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const previousSettings = await prisma.teamGoalSettings.findUnique({ where: { id: 'team' } });
  let testLeadId: string | null = null;

  try {
    const testLead = await prisma.lead.create({ data: { osmId: `e2e-goals-${Date.now()}`, name: 'Progresso metas E2E' } });
    testLeadId = testLead.id;
    await prisma.activity.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        leadId: testLead.id,
        actorId: 'e2e-goals-agent',
        note: `Abordagem automatizada ${index + 1}`,
        type: 'CONTACT' as const,
        createdAt: new Date(Date.now() - index)
      }))
    });

    await page.goto('/login');
    await page.getByLabel('E-mail').fill(e2eCredentials.email);
    await page.getByLabel('Senha').fill(e2eCredentials.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();
    await expect(page).toHaveURL(/\/metas$/);

    const weeklyTab = page.getByRole('tab', { name: 'Semanal' });
    const monthlyTab = page.getByRole('tab', { name: 'Mensal' });
    const weeklyPanel = page.getByRole('tabpanel', { name: 'Semanal' });
    const monthlyPanel = page.getByRole('tabpanel', { name: 'Mensal' });

    await expect(weeklyTab).toHaveAttribute('aria-selected', 'true');
    const weeklyApproachesTarget = weeklyPanel.getByLabel('Meta para abordagens', { exact: true });
    await expect(weeklyApproachesTarget).toBeHidden();
    await weeklyPanel.getByRole('button', { name: 'Editar meta para abordagens' }).click();
    await expect(weeklyApproachesTarget).toBeVisible();
    await weeklyApproachesTarget.fill('321');
    await monthlyTab.click();
    await expect(monthlyTab).toHaveAttribute('aria-selected', 'true');
    await monthlyPanel.getByLabel('Dia de início do ciclo mensal').fill('14');
    const monthlyApproachesTarget = monthlyPanel.getByLabel('Meta para abordagens', { exact: true });
    await expect(monthlyApproachesTarget).toBeHidden();
    await monthlyPanel.getByRole('button', { name: 'Editar meta para abordagens' }).click();
    await expect(monthlyApproachesTarget).toBeVisible();
    await monthlyApproachesTarget.fill('777');
    await monthlyPanel.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(monthlyPanel.getByRole('status')).toContainText('Meta mensal da equipe salva');

    const monthlyGoal = await prisma.goal.findFirst({
      where: { ownerId: '__team__', periodKind: 'MONTHLY' },
      orderBy: { periodStart: 'desc' }
    });
    expect(monthlyGoal?.approachesTarget).toBe(777);
    expect((await prisma.teamGoalSettings.findUnique({ where: { id: 'team' } }))?.monthlyStartDay).toBe(14);
    await monthlyPanel.getByRole('button', { name: 'Fechar edição da meta para abordagens' }).click();
    await expect(monthlyPanel.getByLabel('Abordagens: 10 de 777')).toBeVisible();
    await expect(monthlyPanel.getByRole('progressbar', { name: 'Progresso de abordagens' })).toHaveAttribute('aria-valuetext', '1% da meta');

    await weeklyTab.click();
    await expect(weeklyPanel.getByLabel('Meta para abordagens', { exact: true })).toHaveValue('321');
    await weeklyPanel.getByRole('button', { name: 'Fechar edição da meta para abordagens' }).click();
    await expect(weeklyPanel.getByLabel('Abordagens: 10 de 321')).toBeVisible();
    await expect(weeklyPanel.getByRole('progressbar', { name: 'Progresso de abordagens' })).toHaveAttribute('aria-valuetext', '3% da meta');
    await weeklyPanel.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(weeklyPanel.getByRole('status')).toContainText('Meta semanal da equipe salva');

    const weeklyGoal = await prisma.goal.findFirst({
      where: { ownerId: '__team__', periodKind: 'WEEKLY' },
      orderBy: { periodStart: 'desc' }
    });
    expect(weeklyGoal?.approachesTarget).toBe(321);
  } finally {
    await prisma.goal.deleteMany({ where: { ownerId: '__team__' } });
    if (testLeadId) await prisma.lead.delete({ where: { id: testLeadId } });
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
