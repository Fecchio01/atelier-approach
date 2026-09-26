import { expect, test } from '@playwright/test';
import { e2eCredentials } from './credentials';

test('menu opens each section without requiring another navigation', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect.poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.endsWith('authjs.session-token'))).toBe(true);
  await page.goto('/crm');

  const sections = [
    ['Painel', '/'], ['Empresas', '/pesquisa'], ['Metas', '/metas'],
    ['Relatórios', '/relatorios'], ['Configurações', '/configuracoes'], ['Funil', '/crm']
  ] as const;
  for (let pass = 1; pass <= 2; pass++) {
    for (const [label, path] of sections) {
      const started = Date.now();
      await page.getByRole('navigation', { name: 'Navegação principal' }).first().getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(`http://127.0.0.1:3001${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      console.log(`Passagem ${pass}, ${label}: ${Date.now() - started} ms`);
    }
  }
});
