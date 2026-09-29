import { expect, test, type Page } from '@playwright/test';
import { e2eCredentials } from './credentials';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

async function expectNoViewportOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('opens and closes the mobile navigation drawer accessibly', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);
  await page.goto('/crm');

  const menuButton = page.getByRole('button', { name: 'Abrir menu' });
  await menuButton.click();
  const drawer = page.getByRole('dialog', { name: 'Navegação principal no menu mobile' });
  await expect(drawer).toBeVisible();

  for (const label of ['Painel', 'Funil', 'Empresas', 'Metas', 'Relatórios']) {
    await expect(drawer.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await expect(drawer.getByRole('link', { name: 'Meu perfil' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Sair da conta' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(menuButton).toBeFocused();

  await menuButton.click();
  await drawer.click({ position: { x: 365, y: 400 } });
  await expect(drawer).toBeHidden();

  await menuButton.click();
  await drawer.getByRole('link', { name: 'Metas', exact: true }).click();
  await expect(page).toHaveURL(/\/metas$/);
  await expect(drawer).toBeHidden();
  await expectNoViewportOverflow(page);
});
