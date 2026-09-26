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
    let nativeDialogs = 0;
    page.on('dialog', async (dialog) => { nativeDialogs += 1; await dialog.dismiss(); });
    await page.getByRole('button', { name: 'Devolver para pesquisa' }).click();

    const confirmation = page.getByRole('alertdialog', { name: 'Devolver empresa para pesquisa?' });
    await expect(confirmation).toBeVisible();
    expect(nativeDialogs).toBe(0);
    await confirmation.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: 'Devolver para pesquisa' }).click();
    await expect(confirmation).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: 'Devolver para pesquisa' }).click();
    let failedOnce = false;
    await page.route(`**/api/leads/${lead.id}`, async (route) => {
      if (route.request().method() === 'DELETE' && !failedOnce) {
        failedOnce = true;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Falha temporária ao devolver.' }) });
        return;
      }
      await route.continue();
    });
    await confirmation.getByRole('button', { name: 'Confirmar devolução' }).click();
    await expect(confirmation.getByRole('alert')).toHaveText('Falha temporária ao devolver.');
    await expect(card).toBeVisible();
    await confirmation.getByRole('button', { name: 'Confirmar devolução' }).click();

    await expect(page).toHaveURL('http://127.0.0.1:3001/crm');
    await expect(card).toHaveCount(0);
    expect(nativeDialogs).toBe(0);
  } finally {
    await page.request.delete(`/api/leads/${lead.id}`);
  }
});
