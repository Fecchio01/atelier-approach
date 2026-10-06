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
      import { CommercialSettingsForm } from './components/commercial-settings-form';
      import { LeadDetailModal } from './components/lead-detail-modal';
      const services = [
        { id: 'monthly', name: 'Plano mensal', price: '199.90', billingType: 'MONTHLY', isActive: true },
        { id: 'setup', name: 'Implantação', price: '500.00', billingType: 'ONE_TIME', isActive: true }
      ];
      const lead = { id: 'lead', name: 'Oficina de teste', osmId: 'node/1', stage: 'CONTACTED',
        saleValue: null, mrr: null, phone: null, website: null, instagram: null, whatsapp: null,
        latitude: null, longitude: null, address: null, category: null, activities: [], followUps: [] };
      const mode = new URLSearchParams(window.location.search).get('mode');
      if (mode === 'won') Object.assign(lead, { stage: 'WON', saleValue: '699.90', mrr: '199.90' });
      if (mode === 'pending') Object.assign(lead, { stage: 'FOLLOW_UP', followUps: [{ id: 'pending', state: 'PENDING', dueDate: '2027-01-10T15:30:00.000Z' }] });
      if (mode === 'reversed') Object.assign(lead, { activities: [{ id: 'reversal', type: 'SALE_REVERSED', actorId: 'member', channel: null, createdAt: '2026-10-05T15:30:00.000Z', note: 'Negócio reaberto para CONTACTED; venda revertida.' }] });
      function App() {
        const [open, setOpen] = React.useState(false);
        const [result, setResult] = React.useState('');
        return <main style={{ padding: 20 }}>
          <CommercialSettingsForm services={services} followUpDelayDays={3} />
          <button onClick={() => setOpen(true)}>Abrir lead</button>
          <p data-testid="callback-result">{result}</p>
          {open && <LeadDetailModal lead={lead} services={services} followUpDelayDays={3}
            onClose={() => setOpen(false)} onUpdated={(stage) => { setResult(stage); if (stage !== lead.stage) setOpen(false); }}
            onDeleted={(id) => { setResult('deleted:' + id); setOpen(false); }} />}
        </main>;
      }
      createRoot(document.getElementById('root')).render(<App />);
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }
  });
  script = bundle.outputFiles[0].text;
  const globals = (await readFile('app/globals.css', 'utf8')).replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "../../components";');
  css = (await postcss([tailwindcss()]).process(globals, { from: path.resolve('tests/e2e/component-harness.css') })).css;
});

async function openComponents(page: Page, mode = '') {
  const url = `http://commercial.test/${mode ? `?mode=${mode}` : ''}`;
  await page.route(url, (route) => route.fulfill({ contentType: 'text/html', body: '<html lang="pt-BR"><body><div id="root"></div></body></html>' }));
  await page.goto(url);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await expect(page.getByRole('heading', { name: 'Configurações comerciais' })).toBeVisible();
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`catalog edits, validation, archival and delay preserve drafts on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const requests: { url: string; data: Record<string, unknown> }[] = [];
    let failNext = true;
    await page.route('**/api/**', async (route) => {
      const data = route.request().postDataJSON();
      requests.push({ url: route.request().url(), data });
      if (failNext) {
        failNext = false;
        await route.fulfill({ status: 400, json: { error: 'Preço recusado pelo servidor.' } });
      } else if (route.request().url().endsWith('/commercial-settings')) {
        await route.fulfill({ json: { followUpDelayDays: data.followUpDelayDays } });
      } else {
        const base = { id: 'monthly', name: 'Plano corrigido', price: '250.00', billingType: 'MONTHLY', isActive: true };
        await route.fulfill({ json: { service: { ...base, ...data } } });
      }
    });
    await openComponents(page);
    await page.getByRole('button', { name: 'Editar Plano mensal', exact: true }).click();
    await page.getByLabel('Nome do serviço').fill('Plano corrigido');
    await page.getByLabel('Preço', { exact: true }).fill('250.00');
    await page.getByRole('button', { name: 'Salvar serviço', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Preço recusado pelo servidor.');
    await expect(page.getByLabel('Nome do serviço')).toHaveValue('Plano corrigido');
    await expect(page.getByLabel('Preço', { exact: true })).toHaveValue('250.00');
    await page.getByRole('button', { name: 'Salvar serviço', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Serviço atualizado.');
    expect(requests[1].data).toEqual({ name: 'Plano corrigido', price: '250.00', billingType: 'MONTHLY' });
    await page.getByRole('button', { name: 'Arquivar Plano corrigido', exact: true }).click();
    await expect(page.getByText('Arquivado', { exact: true })).toBeVisible();
    expect(requests[2].data).toEqual({ isActive: false });
    await page.getByLabel('Nome do serviço').fill('Serviço novo');
    await page.getByLabel('Preço', { exact: true }).fill('-1');
    await page.getByRole('button', { name: 'Adicionar serviço', exact: true }).click();
    expect(requests).toHaveLength(3);
    expect(await page.getByLabel('Preço', { exact: true }).evaluate((input) => (input as HTMLInputElement).validity.rangeUnderflow)).toBe(true);
    await page.getByLabel('Preço', { exact: true }).fill('75.50');
    await page.getByLabel('Cobrança').selectOption('ONE_TIME');
    await page.getByRole('button', { name: 'Adicionar serviço', exact: true }).click();
    expect(requests[3].url).toBe('http://commercial.test/api/services');
    expect(requests[3].data).toEqual({ name: 'Serviço novo', price: '75.50', billingType: 'ONE_TIME' });
    await page.getByLabel('Intervalo do follow-up (dias)').fill('5');
    await page.getByRole('button', { name: 'Salvar intervalo' }).click();
    await expect(page.getByRole('status')).toHaveText('Intervalo salvo: 5 dias.');
    expect(requests[4].data).toEqual({ followUpDelayDays: 5 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test(`closing previews totals and preserves selections after API failure on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const bodies: Record<string, unknown>[] = [];
    await page.route('**/api/leads/lead', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill(bodies.length === 1 ? { status: 400, json: { error: 'Serviço indisponível.' } } : { json: { lead: { stage: 'WON' } } });
    });
    await openComponents(page);
    await page.getByRole('button', { name: 'Abrir lead' }).click();
    const modal = page.getByRole('dialog', { name: 'Oficina de teste' });
    await expect(modal.getByRole('button', { name: 'Fechar detalhes' })).toBeFocused();
    await expect(modal.getByLabel('Mover para etapa').locator('option[value="WON"]')).toHaveCount(0);
    await expect(modal.getByText('Os valores desta venda ficarão em zero.')).toBeVisible();
    await modal.getByRole('checkbox', { name: /Plano mensal/ }).check();
    await modal.getByRole('checkbox', { name: /Implantação/ }).check();
    await expect(modal.getByLabel('Resumo da venda')).toContainText('R$ 699,90');
    await expect(modal.getByLabel('Resumo da venda')).toContainText('MRR: R$ 199,90');
    await modal.getByRole('button', { name: 'Fechar negócio', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveText('Serviço indisponível.');
    await expect(modal.getByRole('checkbox', { name: /Plano mensal/ })).toBeChecked();
    await expect(modal.getByRole('checkbox', { name: /Implantação/ })).toBeChecked();
    const surface = await modal.getByTestId('lead-modal-surface').boundingBox();
    expect(surface!.width).toBeLessThanOrEqual(viewport.width);
    expect(surface!.height).toBeLessThanOrEqual(viewport.height);
    await modal.getByRole('button', { name: 'Fechar negócio', exact: true }).click();
    expect(bodies).toEqual([{ stage: 'WON', serviceIds: ['monthly', 'setup'] }, { stage: 'WON', serviceIds: ['monthly', 'setup'] }]);
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('callback-result')).toHaveText('WON');
  });

  test(`zero closing, automatic follow-up, discard and return send their contracts on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const requests: { method: string; body: Record<string, unknown> | null }[] = [];
    await page.route('**/api/leads/lead', async (route) => {
      const method = route.request().method();
      const body = method === 'DELETE' ? null : route.request().postDataJSON();
      requests.push({ method, body });
      await route.fulfill({ json: method === 'DELETE' ? {} : { lead: { stage: body.stage } } });
    });
    await openComponents(page);
    const modal = page.getByRole('dialog', { name: 'Oficina de teste' });
    await page.getByRole('button', { name: 'Abrir lead' }).click();
    await modal.getByRole('button', { name: 'Fechar negócio', exact: true }).click();
    expect(requests[0].body).toEqual({ stage: 'WON', serviceIds: [] });
    await page.getByRole('button', { name: 'Abrir lead' }).click();
    await expect(modal.getByLabel('Data do follow-up', { exact: true })).toHaveCount(0);
    await expect(modal.locator('input[type="datetime-local"]')).toHaveCount(0);
    await expect(modal.getByText(/agendado automaticamente em 3 dias/)).toBeVisible();
    await expect(modal.getByText(/Você pode escolher outra data/)).toHaveCount(0);
    await modal.getByRole('button', { name: 'Agendar follow-up', exact: true }).click();
    expect(requests[1].body).toEqual({ stage: 'FOLLOW_UP' });
    await page.getByRole('button', { name: 'Abrir lead' }).click();
    await modal.getByRole('button', { name: 'Descartar empresa', exact: true }).click();
    const discard = page.getByRole('alertdialog', { name: 'Descartar empresa do funil?' });
    await expect(discard.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await discard.getByRole('button', { name: 'Confirmar descarte' }).click();
    expect(requests[2].body).toEqual({ stage: 'DISCARDED' });
    await page.getByRole('button', { name: 'Abrir lead' }).click();
    await modal.getByRole('button', { name: 'Devolver para pesquisa', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Devolver empresa para pesquisa?' }).getByRole('button', { name: 'Confirmar devolução' }).click();
    expect(requests[3]).toEqual({ method: 'DELETE', body: null });
    await expect(page.getByTestId('callback-result')).toHaveText('deleted:lead');
  });

  test(`manual financial correction, rescheduling and reversal history stay accessible on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const bodies: Record<string, unknown>[] = [];
    let currentStage = 'WON';
    await page.route('**/api/leads/lead', async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ json: { lead: { stage: currentStage } } });
    });
    await openComponents(page, 'won');
    const modal = page.getByRole('dialog', { name: 'Oficina de teste' });
    await page.getByRole('button', { name: 'Abrir lead' }).click();
    await expect(modal.getByText(/Negócio ganho/)).toContainText('R$ 699,90');
    await modal.getByLabel('Valor da venda', { exact: true }).fill('850');
    await modal.getByRole('button', { name: 'Salvar valores da venda', exact: true }).click();
    await expect(modal.getByRole('status')).toHaveText('Valores da venda salvos.');
    expect(bodies[0]).toEqual({ saleValue: 850 });
    await expect(modal).toBeVisible();
    currentStage = 'FOLLOW_UP';
    await openComponents(page, 'pending');
    await page.getByRole('button', { name: 'Abrir lead' }).click();
    await expect(modal.getByLabel('Data do follow-up', { exact: true })).toBeVisible();
    await expect(modal.locator('time[datetime="2027-01-10T15:30:00.000Z"]')).toBeVisible();
    await modal.getByRole('button', { name: 'Reagendar follow-up', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveText('Informe a data e hora do follow-up.');
    expect(bodies).toHaveLength(1);
    await modal.getByLabel('Data do follow-up', { exact: true }).fill('2027-01-20T12:30');
    const expectedDate = await page.evaluate(() => new Date('2027-01-20T12:30').toISOString());
    await modal.getByRole('button', { name: 'Reagendar follow-up', exact: true }).click();
    await expect(page.getByTestId('callback-result')).toHaveText('FOLLOW_UP');
    expect(bodies[1]).toEqual({ followUpAction: 'RESCHEDULE', followUpId: 'pending', followUpAt: expectedDate });
    await modal.getByRole('button', { name: 'Concluir follow-up', exact: true }).click();
    await expect.poll(() => bodies.length).toBe(3);
    expect(bodies[2]).toEqual({ followUpAction: 'COMPLETE', followUpId: 'pending' });
    await modal.getByRole('button', { name: 'Cancelar follow-up', exact: true }).click();
    await expect.poll(() => bodies.length).toBe(4);
    expect(bodies[3]).toEqual({ followUpAction: 'CANCEL', followUpId: 'pending' });
    await openComponents(page, 'reversed');
    await page.getByRole('button', { name: 'Abrir lead' }).click();
    await modal.getByRole('button', { name: 'Histórico', exact: true }).click();
    await expect(modal.getByText('Venda revertida', { exact: true })).toBeVisible();
    await expect(modal.getByText(/Negócio reaberto para CONTACTED/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir lead' })).toBeFocused();
  });
}
