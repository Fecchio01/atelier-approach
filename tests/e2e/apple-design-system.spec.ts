import { expect, test } from '@playwright/test';

test('uses the platform font and honors reduced motion', async ({ page }) => {
  await page.goto('/login');

  const fontFamily = await page.locator('body').evaluate((body) => getComputedStyle(body).fontFamily);
  expect(fontFamily).toContain('system-ui');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const duration = await page.locator('body').evaluate((body) =>
    getComputedStyle(body).getPropertyValue('--atelier-motion-duration').trim()
  );
  expect(duration).toBe('0ms');

  const hasReducedTransparencyFallback = await page.evaluate(() => {
    const rules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        rules.push(...Array.from(sheet.cssRules, (rule) => rule.cssText));
      } catch {
        // Ignore cross-origin stylesheets; the app's own stylesheet remains readable.
      }
    }
    return rules.join('\n').includes('prefers-reduced-transparency: reduce');
  });
  expect(hasReducedTransparencyFallback).toBe(true);
});

test('raises contrast when the user requests more contrast', async ({ page }) => {
  await page.goto('/login');

  const floatingBorder = await page.locator('body').evaluate((body) =>
    getComputedStyle(body).getPropertyValue('--atelier-floating-border').trim()
  );
  expect(floatingBorder).toBe('rgba(255, 255, 255, 0.12)');

  await page.emulateMedia({ contrast: 'more' });
  const highContrastBorder = await page.locator('body').evaluate((body) =>
    getComputedStyle(body).getPropertyValue('--atelier-floating-border').trim()
  );
  expect(highContrastBorder).toBe('rgba(255, 255, 255, 0.38)');
});
