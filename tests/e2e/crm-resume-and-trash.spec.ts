import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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
    const leadNames: string[] = [];
    try {
      for (let index = 1; index <= 7; index += 1) {
        const name = `Lote inicial ${index} E2E-${suffix}`;
        leadNames.push(name);
        leadIds.push(await createApproach(page, name, `overture/resume-${suffix}-${index}`));
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
        const name = `Lote novo ${index} E2E-${suffix}`;
        leadNames.push(name);
        leadIds.push(await createApproach(page, name, `overture/resume-${suffix}-${index}`));
      }

      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await expect(approached.locator('[data-lead-id]')).toHaveCount(10, { timeout: 10_000 });

      const qualifiedName = leadNames[0];
      await approached.getByRole('button', { name: `Abrir detalhes de ${qualifiedName}` }).click();
      const modal = page.getByRole('dialog', { name: qualifiedName });
      await modal.getByLabel('Mover para').selectOption('QUALIFIED');
      await modal.getByRole('button', { name: 'Salvar alterações' }).click();

      const qualified = page.getByRole('region', { name: 'Qualificado', exact: true });
      await expect(approached.locator('[data-lead-id]')).toHaveCount(9);
      await expect(qualified.getByRole('button', { name: `Abrir detalhes de ${qualifiedName}` })).toHaveCount(1);

      await page.goto('/metas');
      await expect(page).toHaveURL(/\/metas(?:\?|$)/);
      await page.goto('/crm');
      await page.reload();

      const board = page.getByRole('region', { name: 'Funil CRM' });
      const reloadedApproached = page.getByRole('region', { name: 'Abordado', exact: true });
      const reloadedQualified = page.getByRole('region', { name: 'Qualificado', exact: true });
      await expect(reloadedApproached.locator('[data-lead-id]')).toHaveCount(9);
      await expect(reloadedQualified.locator('[data-lead-id]')).toHaveCount(1);
      for (const name of leadNames) {
        await expect(board.getByRole('button', { name: `Abrir detalhes de ${name}` })).toHaveCount(1);
      }

      const databaseUrl = process.env.TEST_DATABASE_URL;
      if (!databaseUrl || new URL(databaseUrl).searchParams.get('schema') !== 'atelier_test') {
        throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
      }
      const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      try {
        const persistedLeads = await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, stage: true }
        });
        expect(persistedLeads).toHaveLength(10);
        expect(persistedLeads.filter((lead) => lead.stage === 'CONTACTED')).toHaveLength(9);
        expect(persistedLeads.filter((lead) => lead.stage === 'QUALIFIED')).toHaveLength(1);
        expect(persistedLeads.find((lead) => lead.id === leadIds[0])?.stage).toBe('QUALIFIED');
      } finally {
        await prisma.$disconnect();
      }
    } finally {
      await deleteTestLeads(leadIds);
    }
  });
}

for (const viewport of [
  { label: 'mobile', width: 390, height: 844 },
  { label: 'desktop', width: 1440, height: 900 }
]) {
  test(`keeps the ${viewport.label} stage list independently scrollable and the trash reachable`, async ({ browser, page }) => {
    test.setTimeout(60_000);
    let touchContext: BrowserContext | undefined;
    let testPage = page;
    const suffix = randomUUID();
    const leadIds: string[] = [];
    try {
      if (viewport.label === 'mobile') {
        touchContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: true, hasTouch: true });
        testPage = await touchContext.newPage();
      } else {
        await testPage.setViewportSize({ width: viewport.width, height: viewport.height });
      }

      await signIn(testPage);
      for (let index = 1; index <= 10; index += 1) {
        leadIds.push(await createApproach(testPage, `Rolagem CRM ${index} ${suffix}`, `overture/scroll-${suffix}-${index}`));
      }

      await testPage.goto('/crm');
      const approached = testPage.getByRole('region', { name: 'Abordado', exact: true });
      const leadList = approached.getByTestId('crm-stage-lead-list');
      await expect(approached.locator('[data-lead-id]')).toHaveCount(10);
      await expect.poll(() => leadList.evaluate((element) => {
        return element.scrollHeight > element.clientHeight;
      })).toBe(true);

      const lastLead = approached.locator('[data-lead-id]').last();
      await lastLead.scrollIntoViewIfNeeded();
      await expect.poll(() => leadList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await lastLead.click();
      await expect(testPage.getByRole('dialog')).toBeVisible();
      await testPage.keyboard.press('Escape');

      if (viewport.label === 'mobile') {
        const board = testPage.getByRole('region', { name: 'Funil CRM' });
        await expect.poll(() => board.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

        const touchSession = await touchContext!.newCDPSession(testPage);
        await testPage.evaluate(() => {
          document.addEventListener('touchstart', (event) => {
            (window as Window & { __crmTouchTrusted?: boolean }).__crmTouchTrusted = event.isTrusted;
          }, { once: true });
        });
        const swipe = async (startX: number, startY: number, endX: number, endY: number) => {
          await touchSession.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x: startX, y: startY, id: 1 }]
          });
          for (let step = 1; step <= 6; step += 1) {
            const progress = step / 6;
            await touchSession.send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: [{ x: startX + (endX - startX) * progress, y: startY + (endY - startY) * progress, id: 1 }]
            });
            await testPage.waitForTimeout(20);
          }
          await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        };

        await board.evaluate((element) => { element.scrollLeft = 0; });
        await leadList.evaluate((element) => { element.scrollTop = 0; });
        const boardScrollBeforeVertical = await board.evaluate((element) => element.scrollLeft);
        const listScrollBefore = await leadList.evaluate((element) => element.scrollTop);
        const listBox = await leadList.boundingBox();
        const boardBox = await board.boundingBox();
        expect(listBox).not.toBeNull();
        expect(boardBox).not.toBeNull();

        const visibleLeft = Math.max(boardBox!.x + 20, listBox!.x + 20);
        const visibleRight = Math.min(boardBox!.x + boardBox!.width - 20, listBox!.x + listBox!.width - 20);
        expect(visibleRight).toBeGreaterThan(visibleLeft);
        const touchX = (visibleLeft + visibleRight) / 2;
        const verticalStartY = Math.min(listBox!.y + listBox!.height * 0.75, viewport.height - 35);
        const verticalEndY = Math.max(listBox!.y + 20, verticalStartY - 150);
        expect(verticalStartY - verticalEndY).toBeGreaterThan(80);

        await swipe(touchX, verticalStartY, touchX, verticalEndY);
        await expect.poll(() => testPage.evaluate(() => (window as Window & { __crmTouchTrusted?: boolean }).__crmTouchTrusted)).toBe(true);
        await expect.poll(() => leadList.evaluate((element) => element.scrollTop)).toBeGreaterThan(listScrollBefore);
        await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBe(boardScrollBeforeVertical);

        const listScrollBeforeHorizontal = await leadList.evaluate((element) => element.scrollTop);
        const horizontalStartX = Math.min(boardBox!.x + boardBox!.width - 30, listBox!.x + listBox!.width - 30);
        const horizontalEndX = Math.max(boardBox!.x + 20, horizontalStartX - 180);
        const horizontalY = Math.min(listBox!.y + listBox!.height / 2, viewport.height - 35);
        await swipe(horizontalStartX, horizontalY, horizontalEndX, horizontalY);
        await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(boardScrollBeforeVertical);
        await expect.poll(() => leadList.evaluate((element) => element.scrollTop)).toBe(listScrollBeforeHorizontal);
        await expect.poll(() => board.evaluate((element) => getComputedStyle(element).touchAction)).toBe('auto');
        await touchSession.detach();
      }

      const trash = testPage.getByRole('region', { name: 'Lixeira', exact: true });
      await trash.scrollIntoViewIfNeeded();
      await expect(trash).toBeVisible();
      await expect(approached.locator('[data-lead-id]')).toHaveCount(10);
    } finally {
      try {
        await deleteTestLeads(leadIds);
      } finally {
        await touchContext?.close();
      }
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

      await page.reload();
      await expect(page.getByRole('region', { name: 'Lixeira', exact: true }).getByRole('button', { name: `Abrir detalhes de ${name}` })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Abordado', exact: true }).getByRole('button', { name: `Abrir detalhes de ${name}` })).toHaveCount(0);
    } finally {
      await deleteTestLeads([id]);
    }
  });
}
