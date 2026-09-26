import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { e2eCredentials } from './credentials';

test('returning a company removes it from the funnel without navigating away', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.endsWith('authjs.session-token'))).toBe(true);

  const name = `Oficina Teste ${randomUUID().slice(0, 8)} Centro`;
  const response = await page.request.post('/api/leads', { data: {
    business: { osmId: `node/return-${randomUUID()}`, name },
    channel: 'WHATSAPP'
  } });
  expect(response.status()).toBe(201);
  const { lead } = await response.json();

  try {
    await page.goto('/crm');
    const card = page.getByRole('button', { name: `Abrir detalhes de ${name}` });
    await expect(card).toBeVisible();
    await card.click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Devolver para pesquisa' }).click();

    await expect(page).toHaveURL('http://127.0.0.1:3001/crm');
    await expect(card).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/leads/${lead.id}`);
  }
});
