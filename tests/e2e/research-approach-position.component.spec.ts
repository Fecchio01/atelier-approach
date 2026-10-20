import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { expect, test, type Page } from '@playwright/test';

let script: string;
let css: string;

test.beforeAll(async () => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import PesquisaPage from './app/(app)/pesquisa/page';
      const root = createRoot(document.getElementById('root'));
      root.render(<PesquisaPage />);
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'router-test-boundary',
      setup(builder) {
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'test-router' }));
        builder.onLoad({ filter: /.*/, namespace: 'test-router' }, () => ({
          contents: 'const router = { push(href) { history.pushState({}, "", href); window.scrollTo(0, 0); } }; export function useRouter() { return router; }',
          loader: 'js'
        }));
      }
    }]
  });
  script = bundle.outputFiles[0].text;
  const globals = (await readFile('app/globals.css', 'utf8')).replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "../../components";\n@source "../../app";');
  css = (await postcss([tailwindcss()]).process(globals, { from: path.resolve('tests/e2e/research-harness.css') })).css;
});

async function openResearch(page: Page) {
  await page.route('http://research.test/pesquisa', (route) => route.fulfill({ contentType: 'text/html', body: '<html lang="pt-BR"><body><div id="root"></div></body></html>' }));
  await page.route('**/api/search?**', (route) => route.fulfill({ json: {
    searchId: 'position-search', hasMore: true,
    businesses: Array.from({ length: 45 }, (_, index) => ({
      osmId: `overture/position-${index + 1}`, name: `Oficina ${String(index + 1).padStart(2, '0')}`,
      source: 'Overture', category: 'automotive_repair', phone: null, website: null, instagram: null, whatsapp: null
    }))
  } }));
  await page.goto('http://research.test/pesquisa');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.getByLabel('Nicho', { exact: true }).fill('oficina');
  await page.getByLabel('Região / estado').selectOption('São Paulo, SP');
  await page.getByLabel('Cidade (opcional)').fill('Campinas');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(45);
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  for (const position of [{ name: 'middle', company: 'Oficina 22' }, { name: 'end', company: 'Oficina 45' }]) {
    test(`saving an approach keeps the ${position.name} of research in place on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      let scrollAtSave = 0;
      await page.route('**/api/leads', async (route) => {
        scrollAtSave = await page.evaluate(() => window.scrollY);
        await route.fulfill({ status: 201, json: { lead: { id: 'saved-lead' } } });
      });
      await openResearch(page);
      const card = page.locator('article').filter({ has: page.getByRole('heading', { name: position.company, exact: true }) });
      await card.getByRole('button', { name: 'Marcar como abordada' }).click();
      const save = card.getByRole('button', { name: 'Salvar abordagem', exact: true });
      await save.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(300);
      await save.click();
      await expect(page).toHaveURL('http://research.test/pesquisa');
      await expect(card.getByRole('button', { name: 'Abrir no CRM', exact: true })).toBeVisible();
      await expect(card.getByRole('button', { name: 'Marcar como abordada' })).toHaveCount(0);
      await expect(page.locator('article')).toHaveCount(45);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scrollAtSave, 0);
      await expect(page.getByText('44 prospects novos, em ordem de prioridade.')).toHaveCount(1);
      await expect(page.getByLabel('Nicho', { exact: true })).toHaveValue('oficina');
      await expect(page.getByLabel('Cidade (opcional)')).toHaveValue('Campinas');
      await expect(page.getByRole('button', { name: 'Carregar mais empresas' })).toHaveCount(1);
      await card.getByRole('button', { name: 'Abrir no CRM', exact: true }).click();
      await expect(page).toHaveURL('http://research.test/crm?lead=saved-lead');
    });
  }
}

test('an already saved company stays in research and offers its existing CRM record', async ({ page }) => {
  await page.route('**/api/leads', (route) => route.fulfill({ status: 409, json: { error: 'Esta empresa já está no CRM.', href: '/crm?lead=existing-lead' } }));
  await openResearch(page);
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Oficina 22', exact: true }) });
  await card.getByRole('button', { name: 'Marcar como abordada' }).click();
  await card.getByRole('button', { name: 'Salvar abordagem', exact: true }).click();
  await expect(page).toHaveURL('http://research.test/pesquisa');
  await expect(card.getByRole('button', { name: 'Abrir no CRM', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Abrir no CRM', exact: true }).click();
  await expect(page).toHaveURL('http://research.test/crm?lead=existing-lead&notice=duplicate');
});
