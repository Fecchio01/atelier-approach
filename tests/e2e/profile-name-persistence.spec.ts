import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('saves the display name with pending feedback and keeps it after navigation and reload', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');

  await page.goto('/configuracoes');
  const nameInput = page.getByLabel('Nome exibido');
  await nameInput.fill('Nome persistente Arvello');

  let releaseSave!: () => void;
  let saveStarted!: () => void;
  const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
  const started = new Promise<void>((resolve) => { saveStarted = resolve; });
  await page.route('**/configuracoes**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.headers()['next-action']) {
      saveStarted();
      await saveGate;
    }
    await route.continue();
  });

  try {
    await page.getByRole('button', { name: 'Salvar perfil' }).click({ noWaitAfter: true });
    await started;
    const pendingButton = page.getByRole('button', { name: 'Salvando perfil…' });
    await expect(pendingButton).toBeDisabled();
  } finally {
    releaseSave();
  }

  await expect(page.getByRole('status')).toHaveText('Perfil atualizado.');
  await expect(nameInput).toHaveValue('Nome persistente Arvello');

  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Metas' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/metas');
  await page.getByRole('link', { name: /Meu perfil/ }).first().click();
  await expect(page.getByLabel('Nome exibido')).toHaveValue('Nome persistente Arvello');
  await page.reload();
  await expect(page.getByLabel('Nome exibido')).toHaveValue('Nome persistente Arvello');
});
