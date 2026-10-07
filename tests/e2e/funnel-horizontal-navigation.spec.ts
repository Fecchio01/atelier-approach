import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('keeps a horizontal funnel scrollbar at the top and synchronizes it with the board', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');

  await page.goto('/crm');
  const topScrollbar = page.getByTestId('crm-funnel-top-scrollbar');
  const board = page.getByRole('region', { name: 'Funil CRM' });
  await expect(topScrollbar).toBeVisible();
  await expect(board).toBeVisible();

  await topScrollbar.evaluate((element) => {
    const scrollport = element as HTMLDivElement;
    scrollport.scrollLeft = scrollport.scrollWidth - scrollport.clientWidth;
    scrollport.dispatchEvent(new Event('scroll'));
  });

  await expect.poll(() => board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});
