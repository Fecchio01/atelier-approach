import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

test('offers the default maximum priority in the research form', () => {
  const formSource = readFileSync(resolve(process.cwd(), 'components/search-form.tsx'), 'utf8');

  const maximumPrioritySelect = formSource.split('value={maxScore}')[1];

  expect(maximumPrioritySelect).toContain('<option value="70">70 pontos</option>');
});

test('offers Brazil as a region and derives national search from that selection', () => {
  const formSource = readFileSync(resolve(process.cwd(), 'components/search-form.tsx'), 'utf8');

  expect(formSource).toContain("const isNational = region === 'Brasil';");
  expect(formSource).toContain('<option value="Brasil">Brasil inteiro</option>');
});
