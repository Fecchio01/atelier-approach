import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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

async function expectPdfDownload(page: Page, filename: RegExp) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Baixar PDF' }).click({ timeout: 5_000 })
  ]);
  expect(download.suggestedFilename()).toMatch(filename);
  const path = await download.path();
  expect(path).not.toBeNull();
  expect((await readFile(path!)).subarray(0, 5).toString()).toBe('%PDF-');
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
  await expectPdfDownload(page, /^relatorio-diario-\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('reopens a closed day, preserves CRM activities, and allows a fresh close', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await page.goto('/relatorios');

  await page.getByRole('button', { name: 'Fechar o dia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Dia fechado' })).toBeVisible();
  await page.getByRole('button', { name: 'Reabrir dia' }).click();
  await expect(page.getByText('O relatório e o PDF de hoje serão removidos. As atividades do CRM continuarão salvas.')).toBeVisible();
  await page.getByRole('button', { name: 'Manter fechado' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Dia fechado' })).toBeVisible();

  await page.getByRole('button', { name: 'Reabrir dia' }).click();
  const reopenResponse = page.waitForResponse((response) => response.url().endsWith('/api/reports') && response.request().method() === 'DELETE');
  await page.getByRole('button', { name: 'Confirmar reabertura' }).click();
  expect((await reopenResponse).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Fechar o dia' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Período do relatório' }).getByRole('link', { name: 'Diário' }).click();
  await expect(page.getByText('Este dia ainda não foi fechado. Nenhum relatório diário salvo para esta data.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Baixar PDF' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Fechar o dia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Dia fechado' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Baixar PDF' })).toBeVisible();
});

test('switches report periods through the period tabs and marks the selected view', async ({ page }) => {
  await signIn(page);
  await page.goto('/relatorios');
  const periodNav = page.getByRole('navigation', { name: 'Período do relatório' });

  await periodNav.getByRole('link', { name: 'Ciclo atual' }).click();
  await expect(page).toHaveURL(/\/relatorios\?period=month$/);
  await expect(periodNav.getByRole('link', { name: 'Ciclo atual' })).toHaveAttribute('aria-current', 'page');

  await periodNav.getByRole('link', { name: 'Diário' }).click();
  await expect(page.getByRole('heading', { name: 'Relatório diário' })).toBeVisible();
  const dailyPeriodNav = page.getByRole('navigation', { name: 'Período do relatório' });
  await expect(dailyPeriodNav.getByRole('link', { name: 'Diário' })).toHaveAttribute('aria-current', 'page');

  await dailyPeriodNav.getByRole('link', { name: 'Esta semana' }).click();
  await expect(page).toHaveURL(/\/relatorios\?period=week$/);
  await expect(page.getByRole('navigation', { name: 'Período do relatório' }).getByRole('link', { name: 'Esta semana' })).toHaveAttribute('aria-current', 'page');
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
  await expectPdfDownload(page, /^relatorio-diario-\d{4}-\d{2}-\d{2}\.pdf$/);
  await expectNoViewportOverflow(page);
});

test('downloads live weekly and monthly reports as PDFs before their periods end', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);

  await page.goto('/relatorios');
  await expectPdfDownload(page, /^relatorio-semanal-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.pdf$/);

  await page.goto('/relatorios?period=month');
  await expectPdfDownload(page, /^relatorio-mensal-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.pdf$/);
});
