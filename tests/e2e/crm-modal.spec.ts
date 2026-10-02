import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { e2eCredentials } from './credentials';

test('CRM keeps details private to an accessible modal and preserves lead actions', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  const name = `Auto Brilho ${randomUUID().slice(0, 8)} Teste`;
  const osmId = `node/modal-${randomUUID()}`;
  const response = await page.request.post('/api/leads', { data: {
    business: { osmId, name, phone: '+55 11 99999-8888', instagram: '@autobrilho', website: 'https://example.com' },
    channel: 'WHATSAPP', note: 'Anotação que pertence apenas aos detalhes.'
  } });
  expect(response.status()).toBe(201);
  const { lead } = await response.json();
  try {
    await page.goto('/crm');
    const card = page.getByRole('button', { name: `Abrir detalhes de ${name}` });
    await expect(card).toBeVisible();
    await expect(page.getByText(osmId, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Anotação que pertence apenas aos detalhes.')).toHaveCount(0);
    await expect(page.getByLabel('Nota da atividade')).toHaveCount(0);
    await card.click();
    const modal = page.getByRole('dialog', { name });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('link', { name: 'Instagram', exact: true })).toHaveAttribute('href', 'https://www.instagram.com/autobrilho/');
    await modal.getByRole('button', { name: 'Histórico', exact: true }).click();
    await expect(modal.getByText('Anotação que pertence apenas aos detalhes.')).toBeVisible();
    await modal.getByRole('button', { name: 'Próxima ação', exact: true }).click();
    await modal.getByRole('button', { name: 'Fechar negócio', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveText('Informe o valor da venda e o MRR para fechar o negócio.');
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(card).toBeFocused();
    await card.click();
    await modal.getByLabel('Mover para').selectOption('QUALIFIED');
    await modal.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByRole('region', { name: 'Qualificado', exact: true }).getByRole('button', { name: `Abrir detalhes de ${name}` })).toHaveCount(1);
    await expect(modal).toHaveCount(0);
    await card.click();
    await page.getByTestId('lead-modal-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(modal).toHaveCount(0);
    await card.click();
    await modal.getByRole('button', { name: 'Devolver para pesquisa' }).click();
    const confirmation = page.getByRole('alertdialog', { name: 'Devolver empresa para pesquisa?' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirmation).toBeHidden();
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Devolver para pesquisa' }).click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Confirmar devolução' }).click();
    await expect(modal).toHaveCount(0);
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: `Abrir detalhes de ${name}` })).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/leads/${lead.id}`);
  }
});
