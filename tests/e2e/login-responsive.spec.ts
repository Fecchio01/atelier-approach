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

test('mobile login shows immediate feedback and blocks repeat taps while authentication is pending', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('login-pending@atelier.local');
  await page.getByLabel('Senha', { exact: true }).fill('senha-incorreta');

  let releaseRequest!: () => void;
  let reportRequestStarted!: () => void;
  const requestGate = new Promise<void>((resolve) => { releaseRequest = resolve; });
  const requestStarted = new Promise<void>((resolve) => { reportRequestStarted = resolve; });

  await page.route('**/login', async (route) => {
    if (route.request().method() === 'POST') {
      reportRequestStarted();
      await requestGate;
    }
    await route.continue();
  });

  const submitButton = page.locator('form button[type="submit"]');
  const submitRequest = submitButton.click().catch((error: unknown) => error);
  await requestStarted;

  let feedbackError: unknown;
  try {
    await expect(submitButton).toHaveText('Entrando...', { timeout: 1_500 });
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toHaveAttribute('aria-busy', 'true');
  } catch (error) {
    feedbackError = error;
  } finally {
    releaseRequest();
  }

  const submitResult = await submitRequest;
  if (submitResult instanceof Error) throw submitResult;
  await expect(page).toHaveURL(/\/login\?error=credentials/);
  expect(feedbackError).toBeUndefined();
});

test('desktop login retains the split hero and authentication panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');

  await expect(page.getByRole('heading', { name: 'Seu próximo negócio começa aqui.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entrar na plataforma' })).toBeVisible();
  await expect(page.getByText('Pesquisa · CRM · Resultados').first()).toBeVisible();
});
