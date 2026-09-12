import { expect, test } from '@playwright/test';

test('redirects an anonymous user to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('authenticates a configured internal user', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('equipe@atelier.local');
  await page.getByLabel('Senha').fill('senha-segura');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL('http://127.0.0.1:3000/');
});
