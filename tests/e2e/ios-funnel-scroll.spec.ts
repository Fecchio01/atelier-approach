import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

import { e2eCredentials } from './credentials';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function deleteFixtureLead(id: string | undefined) {
  if (!id) return;
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).searchParams.get('schema') !== 'atelier_test') {
    throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
  }
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await prisma.lead.deleteMany({ where: { id } });
  } finally {
    await prisma.$disconnect();
  }
}

test('keeps horizontal funnel navigation, page scrolling, and lead opening usable in mobile WebKit', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const suffix = randomUUID();
  let leadId: string | undefined;
  try {
    const response = await page.request.post('/api/leads', {
      data: {
        business: { osmId: `overture/ios-scroll-${suffix}`, name: `Lead scroll iOS ${suffix}`, phone: null, website: null, instagram: null, whatsapp: null },
        channel: 'WHATSAPP'
      }
    });
    expect(response.status()).toBe(201);
    const payload = await response.json() as { lead: { id: string } };
    leadId = payload.lead.id;

    await page.goto('/crm');
    const funnel = page.getByRole('region', { name: 'Etapas principais do funil', exact: true });
    const board = page.getByRole('region', { name: 'Funil CRM', exact: true });
    const card = page.getByRole('button', { name: `Abrir detalhes de Lead scroll iOS ${suffix}` });
    await expect(card).toBeVisible();

    const boardBounds = await board.boundingBox();
    expect(boardBounds).not.toBeNull();
    await page.mouse.move(boardBounds!.x + boardBounds!.width / 2, boardBounds!.y + 40);
    await page.mouse.wheel(900, 0);
    await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect(board.getByRole('region', { name: 'Ganho', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.scrollingElement?.scrollLeft ?? 0)).toBe(0);

    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBeGreaterThan(0);
    expect(await funnel.evaluate((element) => element.scrollTop)).toBe(0);

    await board.evaluate((element) => { element.scrollLeft = 0; });
    await card.click();
    await expect(page.getByRole('dialog')).toBeVisible();
  } finally {
    await deleteFixtureLead(leadId);
  }
});
