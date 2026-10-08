import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('uses the shared branded canvas on both cycle and daily reports', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');

  for (const href of ['/', '/relatorios?period=month', '/relatorios?period=day']) {
    await page.goto(href);
    const canvas = page.getByTestId('app-content-canvas');
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('radial-gradient');
  }
});
