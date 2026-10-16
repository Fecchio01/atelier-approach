import { expect, test } from 'vitest';

import { displayCompanyName } from '../../lib/display-name';

test('removes a trailing technical identifier from a company name', () => {
  expect(displayCompanyName('Auto Brilho 53fd4f5b')).toBe('Auto Brilho');
});

test('keeps ordinary company names unchanged', () => {
  expect(displayCompanyName('Oficina 24 Horas')).toBe('Oficina 24 Horas');
});

test('hides a long promotional suffix without changing the source name', () => {
  const source = 'Go Coffee Cafeteria, Quiosque com bebidas quentes e doces para todos os momentos. A sua melhor opção na cidade';

  expect(displayCompanyName(source)).toBe('Go Coffee Cafeteria');
  expect(source).toBe('Go Coffee Cafeteria, Quiosque com bebidas quentes e doces para todos os momentos. A sua melhor opção na cidade');
});

test('keeps a short comma-separated business name', () => {
  expect(displayCompanyName('Café, Doces e Cia')).toBe('Café, Doces e Cia');
});

test('hides a sentence-like promotional suffix even when it is short', () => {
  expect(displayCompanyName('Café Central, A sua pausa favorita.')).toBe('Café Central');
});
