import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

test('offers Brazil as a country and derives national search without a radius', () => {
  const formSource = readFileSync(resolve(process.cwd(), 'components/search-form.tsx'), 'utf8');

  expect(formSource).toContain('<option value="BR">Brasil</option>');
  expect(formSource).toContain("const isNational = country === 'BR' && !region;");
  expect(formSource).not.toContain('Raio (km)');
});

test('keeps automotive aesthetics fixed and does not expose narrowing filters', () => {
  const formSource = readFileSync(resolve(process.cwd(), 'components/search-form.tsx'), 'utf8');

  expect(formSource).toContain("const FIXED_NICHE = 'estética automotiva';");
  expect(formSource).toContain('Cidade (opcional)');
  expect(formSource).not.toContain('Somente com telefone');
  expect(formSource).not.toContain('Prioridade máxima');
  expect(formSource).not.toContain('Prioridade mínima');
});
