import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('shows a live navigation status and ignores repeated taps to the same section', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');
  await page.goto('/configuracoes');

  let releaseNavigation!: () => void;
  let navigationStarted!: () => void;
  let requestCount = 0;
  const navigationGate = new Promise<void>((resolve) => { releaseNavigation = resolve; });
  const started = new Promise<void>((resolve) => { navigationStarted = resolve; });
  await page.route('**/metas**', async (route) => {
    if (route.request().method() === 'GET') {
      requestCount += 1;
      navigationStarted();
      await navigationGate;
    }
    await route.continue();
  });

  try {
    const metasLink = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Metas' });
    await metasLink.evaluate((element: HTMLAnchorElement) => { element.click(); element.click(); });
    await started;
    await expect(page.getByRole('status', { name: 'Navegação em andamento' })).toHaveText('Abrindo Metas…');
    expect(requestCount).toBe(1);
  } finally {
    releaseNavigation();
  }

  await expect(page).toHaveURL('http://127.0.0.1:3001/metas');
  await expect(page.getByRole('heading', { name: 'Metas da equipe' })).toBeVisible();
});
