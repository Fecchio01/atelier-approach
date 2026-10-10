import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

import { e2eCredentials } from './credentials';

const dayMs = 24 * 60 * 60 * 1000;
const activeStages = ['NEW', 'CONTACTED', 'INTEREST', 'IN_CONVERSATION', 'QUALIFIED', 'PROPOSAL', 'MEETING'] as const;
const discardStages = [...activeStages, 'FOLLOW_UP', 'NO_RESPONSE'] as const;
const cronSecret = 'crm-lifecycle-e2e-cron-secret';

function testDatabaseUrl() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).searchParams.get('schema') !== 'atelier_test') {
    throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
  }
  return databaseUrl;
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
}

async function assertCronCandidatesAreFixtureScoped(database: PrismaClient, fixtureIds: string[]) {
  const now = new Date();
  const settings = await database.crmSettings.findUnique({ where: { id: 'team' }, select: { followUpDelayDays: true } });
  const delayDays = settings?.followUpDelayDays ?? 2;
  const safetyMarginMs = 60 * 60 * 1000;
  const dueCutoff = new Date(now.getTime() - delayDays * dayMs + safetyMarginMs);
  const discardCutoff = new Date(now.getTime() - 5 * dayMs + safetyMarginMs);
  const purgeCutoff = new Date(now.getTime() - 7 * dayMs + safetyMarginMs);
  const [due, expired, purge] = await Promise.all([
    database.lead.findMany({
      where: { stage: { in: [...activeStages] }, stageEnteredAt: { lte: dueCutoff }, postFollowUpAt: null },
      select: { id: true }
    }),
    database.lead.findMany({
      where: { stage: { in: [...discardStages] }, postFollowUpAt: { lte: discardCutoff } },
      select: { id: true }
    }),
    database.lead.findMany({
      where: { stage: 'DISCARDED', discardedAt: { lte: purgeCutoff } },
      select: { id: true }
    })
  ]);
  const allowed = new Set(fixtureIds);
  const outOfScope = [...due, ...expired, ...purge].map(({ id }) => id).filter((id) => !allowed.has(id));
  expect(outOfScope, 'Cron would mutate non-fixture leads in atelier_test').toEqual([]);
}

async function runProtectedCron(page: Page, database: PrismaClient, fixtureIds: string[]) {
  await assertCronCandidatesAreFixtureScoped(database, fixtureIds);
  const response = await page.request.get('/api/cron/crm-lifecycle', {
    headers: { authorization: `Bearer ${cronSecret}` }
  });
  expect(response.status()).toBe(200);
  return response.json() as Promise<{ movedToFollowUp: number; discardedForInactivity: number; permanentlyDeleted: number }>;
}

test('runs a complete CRM lead lifecycle with only scoped atelier_test fixtures', async ({ page }) => {
  test.setTimeout(120_000);
  const database = new PrismaClient({ datasources: { db: { url: testDatabaseUrl() } } });
  const fixtureIds: string[] = [];
  const suffix = randomUUID();
  const leadName = `Ciclo CRM E2E ${suffix}`;

  try {
    await assertCronCandidatesAreFixtureScoped(database, fixtureIds);
    await signIn(page);

    const settings = await database.crmSettings.findUnique({ where: { id: 'team' }, select: { followUpDelayDays: true } });
    const dueLead = await database.lead.create({
      data: {
        osmId: `crm-lifecycle-e2e/${suffix}`,
        name: leadName,
        stage: 'CONTACTED',
        stageEnteredAt: new Date(Date.now() - ((settings?.followUpDelayDays ?? 2) + 1) * dayMs)
      }
    });
    fixtureIds.push(dueLead.id);

    const unauthorizedCron = await page.request.get('/api/cron/crm-lifecycle');
    expect(unauthorizedCron.status()).toBe(401);
    const scheduled = await runProtectedCron(page, database, fixtureIds);
    expect(scheduled.movedToFollowUp).toBeGreaterThanOrEqual(1);
    const followUpLead = await database.lead.findUnique({ where: { id: dueLead.id }, select: { stage: true, followUps: { select: { state: true, returnStage: true } } } });
    expect(followUpLead).toMatchObject({ stage: 'FOLLOW_UP', followUps: [{ state: 'PENDING', returnStage: 'CONTACTED' }] });

    await page.goto(`/crm?lead=${encodeURIComponent(dueLead.id)}`);
    const detail = page.getByRole('dialog', { name: leadName });
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Veio de Abordado')).toBeVisible();
    await detail.getByRole('button', { name: 'Concluir follow-up', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const completedLead = await database.lead.findUnique({ where: { id: dueLead.id }, select: { stage: true, postFollowUpAt: true, followUps: { select: { state: true, completedAt: true, returnStage: true } } } });
    expect(completedLead?.stage).toBe('CONTACTED');
    expect(completedLead?.postFollowUpAt).toBeInstanceOf(Date);
    expect(completedLead?.followUps).toEqual([expect.objectContaining({ state: 'COMPLETED', returnStage: 'CONTACTED', completedAt: expect.any(Date) })]);

    const warningTimestamp = new Date(Date.now() - 4 * dayMs);
    await database.lead.update({ where: { id: dueLead.id }, data: { postFollowUpAt: warningTimestamp } });
    await page.goto('/');
    const warningPanel = page.getByRole('region', { name: 'Atenção aos próximos descartes' });
    await expect(warningPanel.getByText(leadName)).toBeVisible();
    await expect(warningPanel.getByText('Abordado · origem: Abordado')).toBeVisible();
    await expect(warningPanel.getByText('Vence em menos de 1 dia')).toBeVisible();
    await warningPanel.getByRole('link', { name: new RegExp(leadName) }).click();
    await expect(page).toHaveURL(new RegExp(String.raw`/crm\?lead=${dueLead.id}$`));
    await expect(page.getByRole('dialog', { name: leadName })).toBeVisible();

    await database.lead.update({ where: { id: dueLead.id }, data: { postFollowUpAt: new Date(Date.now() - 5 * dayMs) } });
    const discarded = await runProtectedCron(page, database, fixtureIds);
    expect(discarded.discardedForInactivity).toBeGreaterThanOrEqual(1);
    const discardedLead = await database.lead.findUnique({ where: { id: dueLead.id }, select: { stage: true, discardedAt: true, postFollowUpAt: true } });
    expect(discardedLead).toMatchObject({ stage: 'DISCARDED', discardedAt: expect.any(Date), postFollowUpAt: null });

    await database.lead.update({ where: { id: dueLead.id }, data: { discardedAt: new Date(Date.now() - 8 * dayMs) } });
    const purged = await runProtectedCron(page, database, fixtureIds);
    expect(purged.permanentlyDeleted).toBeGreaterThanOrEqual(1);
    await expect(database.lead.findUnique({ where: { id: dueLead.id }, select: { id: true } })).resolves.toBeNull();

    const manualTrashLead = await database.lead.create({
      data: {
        osmId: `crm-lifecycle-trash-e2e/${suffix}`,
        name: `${leadName} lixeira manual`,
        stage: 'DISCARDED',
        stageEnteredAt: new Date(),
        discardedAt: new Date()
      }
    });
    fixtureIds.push(manualTrashLead.id);
    const discardedIds = await database.lead.findMany({ where: { stage: 'DISCARDED' }, select: { id: true } });
    expect(discardedIds.map(({ id }) => id), 'Empty trash must contain only this test fixture').toEqual([manualTrashLead.id]);

    await page.goto('/crm');
    await page.getByRole('button', { name: 'Esvaziar lixeira' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Esvaziar lixeira?' });
    await expect(confirmation.getByText('Não pode ser desfeita.')).toBeVisible();
    await confirmation.getByRole('button', { name: 'Confirmar exclusão permanente' }).click();
    await expect(page.getByRole('status')).toHaveText('1 empresa removida permanentemente.');
    await expect(database.lead.findUnique({ where: { id: manualTrashLead.id }, select: { id: true } })).resolves.toBeNull();
  } finally {
    if (fixtureIds.length) await database.lead.deleteMany({ where: { id: { in: fixtureIds } } });
    await database.$disconnect();
  }
});
