import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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
    await expect(page.getByRole('heading', { name: /^Próximos/ })).toBeVisible();
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
    const googleMapsLink = page.getByRole('link', { name: /Abrir .* no Google Maps/ });
    const googleMapsUrl = new URL((await googleMapsLink.getAttribute('href'))!);
    expect(googleMapsUrl.searchParams.get('query')).toBe('Centro Automotivo com um nome comercial muito comprido para testar a quebra de linha em celulares, Rua de teste, 123, bairro com nome comprido, cidade brasileira, Brasil');
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

test('contains kanban scrolling and keeps lead actions reachable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await signIn(page);
  const name = `Oficina ${randomUUID().slice(0, 8)} Mobile`;
  const response = await page.request.post('/api/leads', { data: {
    business: {
      osmId: `node/mobile-${randomUUID()}`,
      name,
      phone: '+55 11 99999-8888',
      instagram: '@oficinamobile',
      website: 'https://example.com',
      address: 'Rua das Oficinas, número 123, bairro automotivo. '.repeat(35)
    },
    channel: 'WHATSAPP',
    note: 'Prospect de teste de layout mobile.'
  } });
  expect(response.status()).toBe(201);
  const { lead } = await response.json();

  try {
    await page.goto('/crm');
    await expectNoViewportOverflow(page);
    const board = page.getByRole('region', { name: 'Funil CRM' });
    await expect(page.getByText('Deslize para ver todas as etapas')).toBeVisible();
    await expect.poll(() => board.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await expectNoViewportOverflow(page);

    const card = page.getByRole('button', { name: `Abrir detalhes de ${name}` });
    await expect(card).toBeVisible();
    await card.click();
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toBeVisible();
    const panel = dialog.locator(':scope > div');
    await expect.poll(() => panel.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width <= window.innerWidth && bounds.left >= 0 && bounds.right <= window.innerWidth;
    })).toBe(true);

    const dialogContent = panel.locator('.overflow-y-auto');
    await expect.poll(() => dialogContent.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Contato', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Histórico', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Próxima ação', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Fechar detalhes' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Próxima ação', exact: true }).click();
    const closeDeal = dialog.getByRole('button', { name: 'Fechar negócio', exact: true });
    await closeDeal.scrollIntoViewIfNeeded();
    await expect(closeDeal).toBeVisible();
    await expectNoViewportOverflow(page);
  } finally {
    await page.request.delete(`/api/leads/${lead.id}`);
  }
});

test('keeps goals and reports usable without page overflow on phones', async ({ page }) => {
  await signIn(page);

  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/metas');
    await expect(page.getByRole('heading', { name: 'Metas da equipe' })).toBeVisible();

    const weeklyTab = page.getByRole('tab', { name: 'Semanal' });
    const monthlyTab = page.getByRole('tab', { name: 'Mensal' });
    const weeklyPanel = page.getByRole('tabpanel', { name: 'Semanal' });
    const monthlyPanel = page.getByRole('tabpanel', { name: 'Mensal' });
    await expect(weeklyTab).toBeVisible();
    await expect(monthlyTab).toBeVisible();
    const weeklyTarget = weeklyPanel.getByLabel('Meta para abordagens', { exact: true });
    await weeklyPanel.getByRole('button', { name: 'Editar meta para abordagens' }).click();
    await expect(weeklyTarget).toBeVisible();
    await expect(weeklyPanel.getByRole('button', { name: 'Salvar metas' })).toBeVisible();
    await expectNoViewportOverflow(page);

    await monthlyTab.click();
    await expect(monthlyPanel.getByLabel('Dia de início do ciclo mensal')).toBeVisible();
    const monthlyTarget = monthlyPanel.getByLabel('Meta para abordagens', { exact: true });
    await monthlyPanel.getByRole('button', { name: 'Editar meta para abordagens' }).click();
    await expect(monthlyTarget).toBeVisible();
    await expectNoViewportOverflow(page);

    await page.goto('/relatorios');
    await expect(page.getByRole('heading', { name: 'Leituras do CRM, sem previsões.' })).toBeVisible();
    const reportPeriods = page.getByRole('navigation', { name: 'Período do relatório' });
    await expect(reportPeriods.getByRole('link', { name: 'Esta semana' })).toBeVisible();
    await expect(reportPeriods.getByRole('link', { name: 'Ciclo atual' })).toBeVisible();
    await reportPeriods.getByRole('link', { name: 'Ciclo atual' }).click();
    await expect(page).toHaveURL(/\/relatorios\?period=month$/);
    await expect(page.getByRole('article').filter({ hasText: 'Receita vendida' })).toBeVisible();
    const reportTables = page.getByRole('region', { name: /^Tabela / });
    await expect(reportTables).toHaveCount(3);
    for (const reportTable of await reportTables.all()) {
      await expect.poll(() => reportTable.evaluate((element) => getComputedStyle(element).overflowX)).toBe('auto');
    }
    await expectNoViewportOverflow(page);
  }
});

test('preserves the desktop sidebar and multi-column dashboard layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Visão operacional' })).toBeVisible();
  await expectNoViewportOverflow(page);
});
