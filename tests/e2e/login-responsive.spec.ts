import { expect, test } from '@playwright/test';

test('mobile login keeps the product story and form usable on narrow screens', async ({ page }) => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Seu próximo negócio começa aqui.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Encontre', exact: true }).last()).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeVisible();
    await expect(page.getByLabel('Senha', { exact: true })).toBeVisible();

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      emailFontSize: Number.parseFloat(getComputedStyle(document.querySelector<HTMLInputElement>('#email')!).fontSize)
    }));

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.emailFontSize).toBeGreaterThanOrEqual(16);
  }
});

test('desktop login retains the split hero and authentication panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Seu próximo negócio começa aqui.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entrar na plataforma' })).toBeVisible();
  await expect(page.getByText('Pesquisa · CRM · Resultados').first()).toBeVisible();
});
