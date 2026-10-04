import { expect, test } from '@playwright/test';

test('login shows the official Arvello identity and accent color on desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/login');

  await expect(page).toHaveTitle('Arvello');
  await expect(page.locator('img[alt="Arvello"]:visible')).toHaveCount(1);
  await expect(page.locator('img[alt="Arvello"]:visible')).toHaveAttribute('src', '/brand/arvello.svg');
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', '/brand/arvello-mark.svg');
  const wordmark = await page.request.get('/brand/arvello.svg');
  const favicon = await page.request.get('/brand/arvello-mark.svg');
  expect(wordmark.status()).toBe(200);
  expect(await wordmark.text()).toContain('ARVELLO');
  expect(favicon.status()).toBe(200);

  const submit = page.getByRole('button', { name: 'Entrar' });
  await expect(submit).toHaveCSS('background-color', 'rgb(167, 216, 26)');
  await submit.hover();
  await page.mouse.down();
  await expect(submit).toHaveCSS('transform', 'matrix(0.985, 0, 0, 0.985, 0, 0)');
  await page.mouse.up();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('img[alt="Arvello"]:visible')).toHaveCount(1);
});

test('keeps useful but restrained feedback for reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');

  await expect(page.locator('html')).toHaveCSS('--atelier-motion-duration', '120ms');
  const submit = page.getByRole('button', { name: 'Entrar' });
  await submit.hover();
  await page.mouse.down();
  await expect(submit).toHaveCSS('transform', 'none');
  await page.mouse.up();
});
