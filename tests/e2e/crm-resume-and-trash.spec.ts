import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

import { e2eCredentials } from './credentials';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/', { timeout: 15_000 });
}

async function createApproach(page: Page, name: string, osmId: string) {
  const response = await page.request.post('/api/leads', {
    data: {
      business: { osmId, name, phone: null, website: null, instagram: null, whatsapp: null },
      channel: 'WHATSAPP'
    }
  });
  expect(response.status()).toBe(201);
  const payload = await response.json() as { lead: { id: string } };
  return payload.lead.id;
}

async function deleteTestLeads(ids: string[]) {
  if (ids.length === 0) return;
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).searchParams.get('schema') !== 'atelier_test') {
    throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
  }
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await prisma.$disconnect();
  }
}

for (const viewport of [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'desktop', width: 1440, height: 900 }
]) {
  test(`refreshes all CRM leads when the ${viewport.label} page returns from an external app`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await signIn(page);

    const suffix = randomUUID();
    const leadIds: string[] = [];
    try {
      for (let index = 1; index <= 7; index += 1) {
        leadIds.push(await createApproach(page, `Lote inicial ${index} ${suffix}`, `overture/resume-${suffix}-${index}`));
      }

      await page.goto('/crm');
      const approached = page.getByRole('region', { name: 'Abordado', exact: true });
      await expect(approached.locator('[data-lead-id]')).toHaveCount(7);
      await approached.locator('[data-lead-id]').first().click();
      const leadModal = page.getByRole('dialog');
      await expect(leadModal).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(leadModal).toHaveCount(0);

      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      for (let index = 8; index <= 10; index += 1) {
        leadIds.push(await createApproach(page, `Lote novo ${index} ${suffix}`, `overture/resume-${suffix}-${index}`));
      }

      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await expect(approached.locator('[data-lead-id]')).toHaveCount(10, { timeout: 10_000 });
    } finally {
      await deleteTestLeads(leadIds);
    }
  });
}

for (const viewport of [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'desktop', width: 1440, height: 900 }
]) {
  test(`keeps the ${viewport.label} stage list independently scrollable and the trash reachable`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await signIn(page);

    const suffix = randomUUID();
    const leadIds: string[] = [];
    try {
      for (let index = 1; index <= 10; index += 1) {
        leadIds.push(await createApproach(page, `Rolagem CRM ${index} ${suffix}`, `overture/scroll-${suffix}-${index}`));
      }

      await page.goto('/crm');
      const approached = page.getByRole('region', { name: 'Abordado', exact: true });
      const leadList = approached.getByTestId('crm-stage-lead-list');
      await expect(approached.locator('[data-lead-id]')).toHaveCount(10);
      await expect.poll(() => leadList.evaluate((element) => {
        return element.scrollHeight > element.clientHeight;
      })).toBe(true);

      const lastLead = approached.locator('[data-lead-id]').last();
      await lastLead.scrollIntoViewIfNeeded();
      await expect.poll(() => leadList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await lastLead.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');

      if (viewport.label === 'mobile') {
        const board = page.getByRole('region', { name: 'Funil CRM' });
        await expect.poll(() => board.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
        await expect.poll(() => board.evaluate((element) => getComputedStyle(element).touchAction)).toBe('auto');
      }

      const trash = page.getByRole('region', { name: 'Lixeira', exact: true });
      await trash.scrollIntoViewIfNeeded();
      await expect(trash).toBeVisible();
      await expect(approached.locator('[data-lead-id]')).toHaveCount(10);
    } finally {
      await deleteTestLeads(leadIds);
    }
  });
}

for (const viewport of [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'desktop', width: 1440, height: 900 }
]) {
  test(`discard confirmation moves a lead to the persistent trash on ${viewport.label}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    page.on('dialog', (dialog) => dialog.dismiss());
    await signIn(page);
    const suffix = randomUUID();
    const name = `Empresa Descartada E2E ${suffix.slice(0, 6)}Z`;
    const id = await createApproach(page, name, `overture/discard-${suffix}`);

    try {
      await page.goto('/crm');
      const detailCard = page.getByRole('button', { name: `Abrir detalhes de ${name}` });
      await detailCard.scrollIntoViewIfNeeded();
      await detailCard.click({ timeout: 5_000 });
      const modal = page.getByRole('dialog', { name });
      await modal.getByRole('button', { name: 'Próxima ação', exact: true }).click();
      await modal.getByRole('button', { name: 'Descartar empresa' }).click();

      const confirmation = page.getByRole('alertdialog', { name: 'Descartar empresa do funil?' });
      await expect(confirmation).toBeVisible({ timeout: 1_000 });
      await confirmation.getByRole('button', { name: 'Cancelar' }).click();
      await expect(confirmation).toBeHidden();
      await expect(modal).toBeVisible();

      await modal.getByRole('button', { name: 'Descartar empresa' }).click();
      await expect(confirmation.getByRole('button', { name: 'Confirmar descarte' })).toBeVisible();
      await confirmation.getByRole('button', { name: 'Confirmar descarte' }).click();

      const trash = page.getByRole('region', { name: 'Lixeira', exact: true });
      await expect(trash.getByRole('button', { name: `Abrir detalhes de ${name}` })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Abordado', exact: true }).getByRole('button', { name: `Abrir detalhes de ${name}` })).toHaveCount(0);

      const duplicate = await page.request.post('/api/leads', {
        data: { business: { osmId: `overture/discard-${suffix}`, name }, channel: 'WHATSAPP' }
      });
      expect(duplicate.status()).toBe(409);
    } finally {
      await deleteTestLeads([id]);
    }
  });
}
