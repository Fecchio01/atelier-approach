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

test('keeps dashboard, search, and profile usable without page overflow on phones', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/search?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      businesses: [{
        osmId: 'node/mobile-prospect',
        name: 'Centro Automotivo com um nome comercial muito comprido para testar a quebra de linha em celulares',
        phone: '+55 11 99999-1234',
        website: 'https://exemplo.example.com/uma-pagina-com-endereco-extenso',
        instagram: '@centroautomotivo',
        whatsapp: null,
        address: 'Rua de teste, 123, bairro com nome comprido, cidade brasileira',
        category: 'car_detailing',
        latitude: -23.55,
        longitude: -46.63,
        source: 'Overture',
        alreadyWorked: false
      }],
      searchId: 'mobile-search',
      hasMore: false
    })
  }));

  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 844 });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Visão operacional' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ciclo mensal' })).toBeVisible();
    await expectNoViewportOverflow(page);

    await page.goto('/pesquisa');
    await expect(page.getByRole('heading', { name: 'Encontre novas empresas.' })).toBeVisible();
    await expect(page.getByLabel('Região / estado')).toBeVisible();
    await expect(page.getByLabel('Cidade (opcional)')).toBeDisabled();
    const searchButton = page.getByRole('button', { name: 'Pesquisar' });
    await expect(searchButton).toBeVisible();
    await expect.poll(() => searchButton.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(200);
    await searchButton.click();
    await expect(page.getByRole('heading', { name: /Centro Automotivo com um nome comercial/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar como abordada' })).toBeVisible();
    await expectNoViewportOverflow(page);

    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { name: 'Perfil e segurança' })).toBeVisible();
    await expect(page.getByLabel('Nome exibido')).toBeVisible();
    await expect(page.getByLabel('Nova senha', { exact: true })).toBeVisible();
    await expect.poll(() => page.getByRole('button', { name: 'Salvar perfil' }).evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(200);
    await expectNoViewportOverflow(page);
  }
});
