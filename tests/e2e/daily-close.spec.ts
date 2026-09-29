import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

import { e2eCredentials } from './credentials';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

async function clearDailyReport() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl || new URL(testDatabaseUrl).searchParams.get('schema') !== 'atelier_test') {
    throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
  }
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    await prisma.dailyReport.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.followUp.deleteMany();
    await prisma.saleEvent.deleteMany();
    await prisma.stageHistory.deleteMany();
    await prisma.lead.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}

async function expectNoViewportOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.beforeEach(async () => clearDailyReport());

test('closes the team day from desktop dashboard and opens its saved daily report', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);

  const dashboardClose = page.getByRole('button', { name: 'Fechar o dia' });
  await expect(dashboardClose).toBeVisible();
  await page.goto('/relatorios');
  await expect(page.getByRole('button', { name: 'Fechar o dia' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Fechar o dia' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Dia fechado' })).toBeVisible();
  await page.getByRole('link', { name: 'Abrir relatório de hoje' }).click();
  await expect(page).toHaveURL(/\/relatorios\?period=day&date=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole('heading', { name: 'Relatório diário' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ações do dia' })).toBeVisible();
  await expect(page.getByText('Nenhuma atividade registrada antes do fechamento.')).toBeVisible();
});

test('closes and browses the daily archive on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);

  await page.goto('/relatorios');
  await expect(page.getByRole('button', { name: 'Fechar o dia' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar o dia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Dia fechado' })).toBeVisible();
  await expectNoViewportOverflow(page);

  await page.getByRole('link', { name: 'Abrir relatório de hoje' }).click();
  await expect(page.getByRole('heading', { name: 'Relatório diário' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fechamentos recentes' })).toBeVisible();
  await expectNoViewportOverflow(page);
});
