import { expect, test } from '@playwright/test';

import { e2eCredentials } from './credentials';

test('keeps every personal metric value and label aligned to the same cell edge', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(e2eCredentials.email);
  await page.getByLabel('Senha').fill(e2eCredentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3001/');

  const results = page.getByRole('heading', { name: 'Meu desempenho' })
    .locator('xpath=../../..')
    .locator('div.grid > div');
  await expect(results).toHaveCount(5);

  for (const result of await results.all()) {
    const alignment = await result.evaluate((element) => ({
      paddingLeft: getComputedStyle(element).paddingLeft,
      borderLeftWidth: getComputedStyle(element).borderLeftWidth,
      valueLeft: element.querySelector('strong')?.getBoundingClientRect().left,
      labelLeft: element.querySelector('span')?.getBoundingClientRect().left
    }));
    expect(alignment.paddingLeft).toBe('0px');
    expect(alignment.borderLeftWidth).toBe('0px');
    expect(alignment.valueLeft).toBe(alignment.labelLeft);
  }
});
