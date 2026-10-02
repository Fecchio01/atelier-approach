import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { expect, test } from '@playwright/test';
import { e2eCredentials } from './credentials';

test('CRM keeps the original stage when updating a lead fails', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  const name = `Falha ${randomUUID().slice(0, 8)} PATCH`;
  const osmId = `node/patch-failure-${randomUUID()}`;
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).searchParams.get('schema') !== 'atelier_test') {
    throw new Error('TEST_DATABASE_URL must point to the isolated atelier_test schema.');
  }
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let leadId: string | null = null;

  try {
    const response = await page.request.post('/api/leads', { data: {
      business: { osmId, name, phone: null, instagram: null, website: null },
      channel: 'WHATSAPP'
    } });
    const payload = await response.json() as { lead?: { id?: string; stage?: string } };
    leadId = payload.lead?.id ?? null;
    expect(response.status()).toBe(201);
    expect(leadId).toBeTruthy();
    if (!leadId) throw new Error('Lead creation response did not include an ID.');
    const lead = { id: leadId, stage: payload.lead?.stage };
    expect(lead.stage).toBe('CONTACTED');
    await page.route(`**/api/leads/${lead.id}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Falha de teste.' }) });
        return;
      }
      await route.continue();
    });

    await page.goto('/crm');
    const approached = page.getByRole('region', { name: 'Abordado', exact: true });
    const card = page.getByRole('button', { name: `Abrir detalhes de ${name}` });
    await expect(approached.getByRole('button', { name: `Abrir detalhes de ${name}` })).toBeVisible();
    await card.click();
    const modal = page.getByRole('dialog', { name });
    await modal.getByLabel('Mover para').selectOption('QUALIFIED');
    await modal.getByRole('button', { name: 'Salvar alterações' }).click();

    await expect(modal.getByRole('alert')).toHaveText('Falha de teste.');
    await expect(modal).toBeVisible();
    await expect(approached.getByRole('button', { name: `Abrir detalhes de ${name}` })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Qualificado', exact: true }).getByRole('button', { name: `Abrir detalhes de ${name}` })).toHaveCount(0);
    await expect.poll(async () => (await prisma.lead.findUnique({ where: { id: lead.id }, select: { stage: true } }))?.stage).toBe('CONTACTED');
  } finally {
    try {
      if (leadId) await prisma.lead.deleteMany({ where: { id: leadId } });
    } finally {
      await prisma.$disconnect();
    }
  }
});

test('CRM keeps details private to an accessible modal and preserves lead actions', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  const name = `Auto Brilho ${randomUUID().slice(0, 8)} Teste`;
  const osmId = `node/modal-${randomUUID()}`;
  const response = await page.request.post('/api/leads', { data: {
    business: { osmId, name, phone: '+55 11 99999-8888', instagram: '@autobrilho', website: 'https://example.com' },
    channel: 'WHATSAPP', note: 'Anotação que pertence apenas aos detalhes.'
  } });
  expect(response.status()).toBe(201);
  const { lead } = await response.json();
  try {
    await page.goto('/crm');
    const card = page.getByRole('button', { name: `Abrir detalhes de ${name}` });
    await expect(card).toBeVisible();
    await expect(page.getByText(osmId, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Anotação que pertence apenas aos detalhes.')).toHaveCount(0);
    await expect(page.getByLabel('Nota da atividade')).toHaveCount(0);
    await card.click();
    const modal = page.getByRole('dialog', { name });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('link', { name: 'Instagram', exact: true })).toHaveAttribute('href', 'https://www.instagram.com/autobrilho/');
    await modal.getByRole('button', { name: 'Histórico', exact: true }).click();
    await expect(modal.getByText('Anotação que pertence apenas aos detalhes.')).toBeVisible();
    await modal.getByRole('button', { name: 'Próxima ação', exact: true }).click();
    await modal.getByRole('button', { name: 'Fechar negócio', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveText('Informe o valor da venda e o MRR para fechar o negócio.');
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(card).toBeFocused();
    await card.click();
    await modal.getByLabel('Mover para').selectOption('QUALIFIED');
    await modal.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByRole('region', { name: 'Qualificado', exact: true }).getByRole('button', { name: `Abrir detalhes de ${name}` })).toHaveCount(1);
    await expect(modal).toHaveCount(0);
    await card.click();
    await page.getByTestId('lead-modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(modal).toHaveCount(0);
    await card.click();
    await modal.getByRole('button', { name: 'Devolver para pesquisa' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Devolver empresa para pesquisa?' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirmation).toBeHidden();
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Devolver para pesquisa' }).click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Confirmar devolução' }).click();
    await expect(modal).toHaveCount(0);
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: `Abrir detalhes de ${name}` })).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/leads/${lead.id}`);
  }
});
