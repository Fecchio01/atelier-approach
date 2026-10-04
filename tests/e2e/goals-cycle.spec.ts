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
    await weeklyPanel.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(weeklyPanel.getByRole('status')).toContainText('Meta semanal da equipe salva');
    await weeklyPanel.getByRole('button', { name: 'Adicionar indicador' }).click();
    await weeklyPanel.getByLabel(/^Nome do indicador /).last().fill('Conversas da equipe');
    const weeklyCustom = weeklyPanel;
    await weeklyCustom.getByLabel(/^Meta do indicador /).fill('20');
    await weeklyCustom.getByLabel(/^Progresso do indicador /).fill('7');
    await weeklyCustom.getByLabel(/^Origem do indicador /).selectOption('approaches');
    await expect(weeklyCustom.getByLabel(/^Progresso do indicador /)).toBeDisabled();
    await expect(weeklyCustom.getByLabel('Conversas da equipe: 10 de 20')).toBeVisible();
    await weeklyCustom.getByLabel(/^Origem do indicador /).selectOption('manual');
    await expect(weeklyCustom.getByLabel(/^Progresso do indicador /)).toHaveValue('7');
    await weeklyCustom.getByLabel(/^Origem do indicador /).selectOption('approaches');
    await weeklyCustom.getByRole('button', { name: 'Fechar edição de Conversas da equipe' }).click();
    await expect(weeklyCustom.getByLabel(/^Nome do indicador /)).toHaveCount(0);
    await expect(weeklyCustom.getByRole('progressbar', { name: 'Progresso de Conversas da equipe' })).toHaveAttribute('aria-valuetext', '50% da meta');

    // Moving a focused editor between theme sections unmounts its row. The latest
    // values must be persisted by the move itself, without relying on blur.
    await weeklyCustom.getByRole('button', { name: 'Adicionar indicador' }).click();
    const transientMetricName = weeklyCustom.getByLabel(/^Nome do indicador /).last();
    await transientMetricName.fill('Indicador especial');
    await weeklyCustom.getByLabel(/^Meta do indicador /).last().fill('12');
    await weeklyCustom.getByLabel(/^Progresso do indicador /).last().fill('4');
    await weeklyCustom.getByLabel(/^Tema do indicador /).last().selectOption('revenue');
    await expect(weeklyCustom.getByLabel(/^Nome do indicador /)).toHaveCount(1);
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Funil' }).click();
    await expect(page).toHaveURL(/\/crm$/);
    const weeklyAfterThemeMove = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'WEEKLY' } });
    expect(weeklyAfterThemeMove?.customGoals).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Indicador especial', group: 'revenue', target: 12, current: 4 })
    ]));
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();
    await expect(page).toHaveURL(/\/metas$/);
    await page.reload();
    const restoredAfterThemeMove = page.getByRole('tabpanel', { name: 'Semanal' });
    await expect(restoredAfterThemeMove.getByLabel('Indicador especial: 4 de 12')).toBeVisible();
    await expect(restoredAfterThemeMove.getByLabel(/^Nome do indicador /)).toHaveCount(0);

    // Renaming can also auto-infer a new group and unmount the focused editor.
    await restoredAfterThemeMove.getByRole('button', { name: 'Adicionar indicador' }).click();
    const inferredMetricName = restoredAfterThemeMove.getByLabel(/^Nome do indicador /).last();
    await inferredMetricName.fill('Indicador livre');
    await restoredAfterThemeMove.getByLabel(/^Meta do indicador /).last().fill('9');
    await restoredAfterThemeMove.getByLabel(/^Progresso do indicador /).last().fill('3');
    await inferredMetricName.fill('Receita recorrente');
    await expect(restoredAfterThemeMove.getByLabel(/^Nome do indicador /)).toHaveCount(1);
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Funil' }).click();
    await expect(page).toHaveURL(/\/crm$/);
    const weeklyAfterInferredMove = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'WEEKLY' } });
    expect(weeklyAfterInferredMove?.customGoals).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Receita recorrente', group: 'revenue', target: 9, current: 3 })
    ]));
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();
    await expect(page).toHaveURL(/\/metas$/);
    await page.reload();
    await expect(page.getByRole('tabpanel', { name: 'Semanal' }).getByLabel('Receita recorrente: 3 de 9')).toBeVisible();

    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Funil' }).click();
    await expect(page).toHaveURL(/\/crm$/);
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();
    await expect(page).toHaveURL(/\/metas$/);
    const restoredBeforeSave = page.getByRole('tabpanel', { name: 'Semanal' });
    await expect(restoredBeforeSave.getByLabel('Conversas da equipe: 10 de 20')).toBeVisible();

    await monthlyTab.click();
    await expect(monthlyTab).toHaveAttribute('aria-selected', 'true');
    await monthlyPanel.getByLabel('Dia de início do ciclo mensal').fill('14');
    const monthlyApproachesTarget = monthlyPanel.getByLabel('Meta para abordagens', { exact: true });
    await expect(monthlyApproachesTarget).toBeHidden();
    await monthlyPanel.getByRole('button', { name: 'Editar meta para abordagens' }).click();
    await expect(monthlyApproachesTarget).toBeVisible();
    await monthlyApproachesTarget.fill('777');
    await monthlyPanel.getByRole('button', { name: 'Adicionar indicador' }).click();
    await monthlyPanel.getByLabel(/^Nome do indicador /).last().fill('Carros do mês');
    const monthlyCustom = monthlyPanel;
    await monthlyCustom.getByLabel(/^Meta do indicador /).fill('8');
    await monthlyCustom.getByLabel(/^Progresso do indicador /).fill('2');
    await monthlyCustom.getByRole('button', { name: 'Fechar edição de Carros do mês' }).click();
    await expect(monthlyCustom.getByLabel('Carros do mês: 2 de 8')).toBeVisible();
    await monthlyPanel.getByRole('button', { name: 'Salvar metas' }).click();
    await expect(monthlyPanel.getByRole('status')).toContainText('Meta mensal da equipe salva');

    const monthlyGoal = await prisma.goal.findFirst({
      where: { ownerId: '__team__', periodKind: 'MONTHLY' },
      orderBy: { periodStart: 'desc' }
    });
    expect(monthlyGoal?.approachesTarget).toBe(777);
    expect(monthlyGoal?.customGoals).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Carros do mês', source: 'manual', current: 2 })]));
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
    expect(weeklyGoal?.customGoals).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Conversas da equipe', source: 'approaches', current: 7 })]));
    await page.reload();
    const restoredCustom = page.getByRole('tabpanel', { name: 'Semanal' });
    await expect(restoredCustom.getByLabel('Conversas da equipe: 10 de 20')).toBeVisible();
    await expect(restoredCustom.getByLabel(/^Nome do indicador /)).toHaveCount(0);
    await restoredCustom.getByRole('button', { name: 'Remover Conversas da equipe' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Semanal' }).getByRole('heading', { name: 'Conversas da equipe', exact: true })).toHaveCount(0);
    const weeklyAfterManualRemoval = await prisma.goal.findFirst({ where: { ownerId: '__team__', periodKind: 'WEEKLY' } });
    expect(weeklyAfterManualRemoval?.customGoals).toEqual([]);
    await page.reload();
    await expect(page.getByRole('tabpanel', { name: 'Semanal' }).getByRole('heading', { name: 'Conversas da equipe', exact: true })).toHaveCount(0);
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
