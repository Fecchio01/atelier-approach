import { PrismaClient } from '@prisma/client';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

function localToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const iso = `${part('year')}-${part('month')}-${part('day')}`;
  const [year, month, day] = iso.split('-');
  return { iso, br: `${day}/${month}/${year}` };
}

async function makeResultsPdf() {
  const { br } = localToday();
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(`Período: ${br} a ${br}`, { x: 36, y: 760, font, size: 12 });
  page.drawText('Abordagens: 17', { x: 36, y: 738, font, size: 12 });
  return Buffer.from(await pdf.save());
}

test('reviews local PDF totals, persists them without uploading the PDF, and allows isolated removal', async ({ page }) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const fileName = 'e2e-resultados-metricas.pdf';
  const pdfBuffer = await makeResultsPdf();
  let savedBatchId: string | undefined;
  let requestBody: Record<string, unknown> | undefined;

  try {
    await prisma.metricImportBatch.deleteMany({ where: { ownerId: '__team__', fileName } });
    await page.route('**/api/metric-imports', async (route, request) => {
      if (request.method() === 'POST') requestBody = request.postDataJSON() as Record<string, unknown>;
      await route.continue();
    });
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(e2eCredentials.email);
    await page.getByLabel('Senha').fill(e2eCredentials.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: 'Metas' }).click();

    const weeklyPanel = page.locator('#goal-panel-weekly');
    await weeklyPanel.getByLabel('Importar resultados de PDF').setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(weeklyPanel.getByLabel('Valor realizado 1')).toHaveValue('17');
    await expect(weeklyPanel.getByLabel('Início do período dos resultados')).toHaveValue(localToday().iso);
    await weeklyPanel.getByRole('button', { name: 'Salvar resultados revisados' }).click();
    await expect(weeklyPanel.getByRole('status')).toContainText('Resultados importados e salvos', { timeout: 15_000 });

    expect(requestBody).toBeDefined();
    expect(requestBody).not.toHaveProperty('pdf');
    expect(requestBody).not.toHaveProperty('bytes');
    expect(Object.keys(requestBody ?? {}).sort()).toEqual(['confirmAdditional', 'fileName', 'periodEnd', 'periodStart', 'rows'].sort());
    const batch = await prisma.metricImportBatch.findFirst({ where: { ownerId: '__team__', fileName } });
    expect(batch).not.toBeNull();
    savedBatchId = batch?.id;

    await page.reload();
    const reloadedPanel = page.locator('#goal-panel-weekly');
    await expect(reloadedPanel.getByText(fileName, { exact: false })).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await reloadedPanel.getByRole('button', { name: 'Remover lote' }).click();
    await expect(reloadedPanel.getByText(fileName, { exact: false })).toHaveCount(0);
    expect(await prisma.metricImportBatch.findUnique({ where: { id: savedBatchId! } })).toBeNull();
  } finally {
    await prisma.metricImportBatch.deleteMany({ where: { ownerId: '__team__', fileName } });
    await prisma.$disconnect();
  }
});
