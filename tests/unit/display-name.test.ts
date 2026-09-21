import { expect, test } from 'vitest';

import { displayCompanyName } from '../../lib/display-name';

test('removes a trailing technical identifier from a company name', () => {
  expect(displayCompanyName('Auto Brilho 53fd4f5b')).toBe('Auto Brilho');
});

test('keeps ordinary company names unchanged', () => {
  expect(displayCompanyName('Oficina 24 Horas')).toBe('Oficina 24 Horas');
});
