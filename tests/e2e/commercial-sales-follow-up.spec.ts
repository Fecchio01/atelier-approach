import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

import { e2eCredentials } from './credentials';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).searchParams.get('schema') !== 'atelier_test') {
  throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

async function createLead(page: Page, name: string) {
  const response = await page.request.post('/api/leads', { data: {
    business: { osmId: `node/commercial-${randomUUID()}`, name, phone: null, instagram: null, website: null },
    channel: 'WHATSAPP'
  } });
  expect(response.status()).toBe(201);
  const payload = await response.json() as { lead: { id: string } };
  await page.goto('/crm');
  return payload.lead.id;
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`commercial settings, service sales and automatic follow-up work on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await signIn(page);

    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const originalSettings = await prisma.crmSettings.findUnique({ where: { id: 'team' } });
    const suffix = randomUUID().slice(0, 8);
    const monthlyName = `Plano mensal ${suffix}`;
    const oneTimeName = `Implantação ${suffix}`;
    const wonLeadName = `Venda de teste ${suffix}`;
    const zeroLeadName = `Venda sem catálogo ${suffix}`;
    const followUpLeadName = `Retorno automático ${suffix}`;
    const leadIds: string[] = [];
    const serviceIds: string[] = [];

    try {
      await page.goto('/configuracoes');
      await expect(page.getByRole('heading', { name: 'Configurações comerciais' })).toBeVisible();

      await page.getByLabel('Nome do serviço').fill(monthlyName);
      await page.getByLabel('Preço').fill('199.90');
      await page.getByLabel('Cobrança').selectOption('MONTHLY');
      await page.getByRole('button', { name: 'Adicionar serviço' }).click();
      await expect(page.getByText(monthlyName, { exact: true })).toBeVisible();
      const monthly = await prisma.serviceCatalogItem.findFirstOrThrow({ where: { name: monthlyName } });
      serviceIds.push(monthly.id);
      await page.getByRole('button', { name: `Editar ${monthlyName}`, exact: true }).click();
      await page.getByLabel('Preço', { exact: true }).fill('299.90');
      await page.getByRole('button', { name: 'Salvar serviço', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Serviço atualizado');
      expect(Number((await prisma.serviceCatalogItem.findUniqueOrThrow({ where: { id: monthly.id } })).price)).toBe(299.9);
      await page.getByRole('button', { name: `Editar ${monthlyName}`, exact: true }).click();
      await page.getByLabel('Preço', { exact: true }).fill('199.90');
      await page.getByRole('button', { name: 'Salvar serviço', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Serviço atualizado');

      await page.getByLabel('Nome do serviço').fill(oneTimeName);
      await page.getByLabel('Preço').fill('500.00');
      await page.getByLabel('Cobrança').selectOption('ONE_TIME');
      await page.getByRole('button', { name: 'Adicionar serviço' }).click();
      await expect(page.getByText(oneTimeName, { exact: true })).toBeVisible();
      const oneTime = await prisma.serviceCatalogItem.findFirstOrThrow({ where: { name: oneTimeName } });
      serviceIds.push(oneTime.id);
      const archivedName = `Arquivado ${suffix}`;
      await page.getByLabel('Nome do serviço').fill(archivedName);
      await page.getByLabel('Preço', { exact: true }).fill('50');
      await page.getByRole('button', { name: 'Adicionar serviço' }).click();
      await expect(page.getByText(archivedName, { exact: true })).toBeVisible();
      const archived = await prisma.serviceCatalogItem.findFirstOrThrow({ where: { name: archivedName } });
      serviceIds.push(archived.id);
      await page.getByRole('button', { name: `Arquivar ${archivedName}`, exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Serviço arquivado');
      expect((await prisma.serviceCatalogItem.findUniqueOrThrow({ where: { id: archived.id } })).isActive).toBe(false);

      if (viewport.name === 'mobile') {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      }

      await page.getByLabel('Intervalo do follow-up (dias)').fill('3');
      await page.getByRole('button', { name: 'Salvar intervalo' }).click();
      await expect(page.getByRole('status')).toContainText('3 dias');

      await page.goto('/crm');
      const wonLeadId = await createLead(page, wonLeadName);
      leadIds.push(wonLeadId);
      const wonCard = page.getByRole('button', { name: `Abrir detalhes de ${wonLeadName}` });
      await expect(wonCard).toBeVisible();
      await wonCard.click();

      const wonModal = page.getByRole('dialog', { name: wonLeadName });
      await expect(wonModal.getByRole('button', { name: 'Contato', exact: true })).toBeVisible();
      await expect(wonModal.getByRole('button', { name: 'Histórico', exact: true })).toBeVisible();
      await expect(wonModal.getByRole('button', { name: 'Próxima ação', exact: true })).toHaveCount(0);
      for (const redundantField of ['Canal da atividade', 'Nota da atividade', 'Registrar contato']) {
        await expect(wonModal.getByText(redundantField, { exact: true })).toHaveCount(0);
      }

      const stagePicker = wonModal.getByLabel('Mover para etapa');
      await expect(stagePicker.locator('option[value="WON"]')).toHaveCount(0);
      await expect(wonModal.getByRole('checkbox', { name: new RegExp(archivedName) })).toHaveCount(0);
      await wonModal.getByRole('checkbox', { name: new RegExp(monthlyName) }).check();
      await wonModal.getByRole('checkbox', { name: new RegExp(oneTimeName) }).check();
      await expect(wonModal.getByText('R$ 699,90', { exact: true })).toBeVisible();
      await expect(wonModal.getByText('MRR: R$ 199,90', { exact: true })).toBeVisible();
      await wonModal.getByRole('button', { name: 'Fechar negócio', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Ganho', exact: true }).getByRole('button', { name: `Abrir detalhes de ${wonLeadName}` })).toBeVisible();

      const sale = await prisma.saleEvent.findFirstOrThrow({ where: { leadId: wonLeadId }, include: { lineItems: true } });
      expect(Number(sale.saleValue)).toBe(699.9);
      expect(Number(sale.mrr)).toBe(199.9);
      expect(sale.lineItems).toHaveLength(2);

      await page.getByRole('button', { name: `Abrir detalhes de ${wonLeadName}` }).click();
      const reopenedModal = page.getByRole('dialog', { name: wonLeadName });
      await reopenedModal.getByLabel('Mover para etapa').selectOption('CONTACTED');
      await reopenedModal.getByRole('button', { name: 'Salvar alterações' }).click();
      await expect(page.getByRole('region', { name: 'Abordado', exact: true }).getByRole('button', { name: `Abrir detalhes de ${wonLeadName}` })).toBeVisible();
      const reversedSale = await prisma.saleEvent.findFirstOrThrow({ where: { id: sale.id } });
      expect(reversedSale.reversedAt).toBeTruthy();
      const currentLead = await prisma.lead.findUniqueOrThrow({ where: { id: wonLeadId } });
      expect(currentLead.saleValue).toBeNull();
      expect(currentLead.mrr).toBeNull();
      expect(await prisma.saleEvent.count({ where: { leadId: wonLeadId, reversedAt: null } })).toBe(0);
      await wonCard.click();
      await reopenedModal.getByRole('button', { name: 'Histórico', exact: true }).click();
      await expect(reopenedModal.getByText('Venda revertida', { exact: true })).toBeVisible();
      await reopenedModal.getByRole('button', { name: 'Fechar detalhes' }).click();
      await page.goto('/?period=day');
      await expect(page.getByRole('article').filter({ has: page.getByText('Receita vendida', { exact: true }) })).toContainText('R$ 0');
      await expect(page.getByRole('article').filter({ has: page.getByText('MRR', { exact: true }) })).toContainText('R$ 0');

      const zeroLeadId = await createLead(page, zeroLeadName);
      leadIds.push(zeroLeadId);
      const zeroCard = page.getByRole('button', { name: `Abrir detalhes de ${zeroLeadName}` });
      await zeroCard.click();
      const zeroModal = page.getByRole('dialog', { name: zeroLeadName });
      await expect(zeroModal.getByText('Os valores desta venda ficarão em zero.', { exact: false })).toBeVisible();
      await zeroModal.getByRole('button', { name: 'Fechar negócio', exact: true }).click();
      await expect(zeroModal).toHaveCount(0);
      const zeroSale = await prisma.saleEvent.findFirstOrThrow({ where: { leadId: zeroLeadId } });
      expect(Number(zeroSale.saleValue)).toBe(0);
      expect(Number(zeroSale.mrr)).toBe(0);

      const followUpLeadId = await createLead(page, followUpLeadName);
      leadIds.push(followUpLeadId);
      await page.getByRole('button', { name: `Abrir detalhes de ${followUpLeadName}` }).click();
      const followUpModal = page.getByRole('dialog', { name: followUpLeadName });
      await followUpModal.getByLabel('Mover para etapa').selectOption('FOLLOW_UP');
      await followUpModal.getByRole('button', { name: 'Salvar alterações' }).click();
      await expect(page.getByRole('region', { name: 'Follow-up', exact: true }).getByRole('button', { name: `Abrir detalhes de ${followUpLeadName}` })).toBeVisible();
      const followUp = await prisma.followUp.findFirstOrThrow({ where: { leadId: followUpLeadId, state: 'PENDING' } });
      expect(followUp.dueDate.valueOf()).toBeGreaterThan(Date.now() + 2 * 24 * 60 * 60 * 1000);
      expect(followUp.dueDate.valueOf()).toBeLessThan(Date.now() + 4 * 24 * 60 * 60 * 1000);
      await page.getByRole('button', { name: `Abrir detalhes de ${followUpLeadName}` }).click();
      await expect(followUpModal.locator(`time[datetime="${followUp.dueDate.toISOString()}"]`)).toBeVisible();
      await followUpModal.getByLabel('Data do follow-up', { exact: true }).fill('2027-01-20T12:30');
      await followUpModal.getByRole('button', { name: 'Reagendar follow-up', exact: true }).click();
      await expect.poll(async () => prisma.followUp.count({ where: { leadId: followUpLeadId, state: 'PENDING' } })).toBe(1);
      await expect.poll(async () => (await prisma.followUp.findFirstOrThrow({ where: { leadId: followUpLeadId, state: 'PENDING' } })).dueDate.valueOf()).toBe(new Date('2027-01-20T12:30').valueOf());

      if (viewport.name === 'mobile') {
        const modalSurface = await followUpModal.getByTestId('lead-modal-surface').boundingBox();
        expect(modalSurface?.width).toBeLessThanOrEqual(viewport.width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      }
      await followUpModal.getByRole('button', { name: 'Descartar empresa', exact: true }).click();
      const discardConfirmation = page.getByRole('alertdialog', { name: 'Descartar empresa do funil?' });
      await discardConfirmation.getByRole('button', { name: 'Confirmar descarte' }).click();
      await expect(page.getByRole('region', { name: 'Lixeira' }).getByRole('button', { name: `Abrir detalhes de ${followUpLeadName}` })).toBeVisible();
      await page.getByRole('button', { name: `Abrir detalhes de ${followUpLeadName}` }).click();
      await followUpModal.getByRole('button', { name: 'Devolver para pesquisa', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'Devolver empresa para pesquisa?' }).getByRole('button', { name: 'Confirmar devolução' }).click();
      await expect(page.getByRole('button', { name: `Abrir detalhes de ${followUpLeadName}` })).toHaveCount(0);
    } finally {
      try {
        if (leadIds.length) await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
        if (serviceIds.length) await prisma.serviceCatalogItem.deleteMany({ where: { id: { in: serviceIds } } });
        if (originalSettings) {
          await prisma.crmSettings.upsert({ where: { id: 'team' }, create: originalSettings, update: { followUpDelayDays: originalSettings.followUpDelayDays } });
        } else {
          await prisma.crmSettings.deleteMany({ where: { id: 'team' } });
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  });
}
