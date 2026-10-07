import { expect, test } from '@playwright/test';
import { e2eCredentials } from './credentials';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/', { timeout: 15_000 });
}

test('dashboard period links navigate immediately and keep their selected state', async ({ page }) => {
  await signIn(page);
  const periods = page.getByRole('navigation', { name: 'Período do dashboard' });

  await periods.getByRole('link', { name: 'Semana' }).click();
  await expect(page).toHaveURL(/period=week/);
  await expect(periods.getByRole('link', { name: 'Semana' })).toHaveAttribute('aria-current', 'page');

  await periods.getByRole('link', { name: 'Ciclo mensal' }).click();
  await expect(page).toHaveURL(/period=month/);
  await expect(periods.getByRole('link', { name: 'Ciclo mensal' })).toHaveAttribute('aria-current', 'page');
});

test('dashboard remains usable at mobile width with reduced motion enabled', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);

  await expect(page.getByRole('navigation', { name: 'Período do dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Visão operacional' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('dashboard does not create a decorative WebGL scene', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);

  await expect(page.getByRole('heading', { name: 'Visão operacional' })).toBeVisible();
  await expect(page.getByTestId('dashboard-scene-canvas')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-scene-static-fallback')).toHaveCount(0);
});
