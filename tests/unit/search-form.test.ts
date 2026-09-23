import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

test('offers Brazil as a country and derives national search without a radius', () => {
  const formSource = readFileSync(resolve(process.cwd(), 'components/search-form.tsx'), 'utf8');

  expect(formSource).toContain('<option value="BR">Brasil</option>');
  expect(formSource).toContain("const isNational = country === 'BR' && !region;");
  expect(formSource).not.toContain('Raio (km)');
});

test('submits the actual selected form values so restored browser selections are honored', () => {
  const formSource = readFileSync(resolve(process.cwd(), 'components/search-form.tsx'), 'utf8');

  expect(formSource).toContain('new FormData(event.currentTarget)');
  expect(formSource.indexOf('const formData = new FormData(event.currentTarget);')).toBeLessThan(formSource.indexOf('onSearchStart();'));
  expect(formSource).toContain("const region = String(formData.get('region') ?? '');");
  expect(formSource).toContain('value={region}');
  expect(formSource).not.toContain('defaultValue=""');
  expect(formSource).toContain("const isNational = country === 'BR' && !region;");
});

test('keeps automotive aesthetics fixed and does not expose narrowing filters', () => {
  const formSource = readFileSync(resolve(process.cwd(), 'components/search-form.tsx'), 'utf8');

  expect(formSource).toContain("const FIXED_NICHE = 'estética automotiva';");
  expect(formSource).toContain('Cidade (opcional)');
  expect(formSource).not.toContain('Somente com telefone');
  expect(formSource).not.toContain('Prioridade máxima');
  expect(formSource).not.toContain('Prioridade mínima');
});

test('keeps the country field from overlapping the fixed niche field', () => {
  const formSource = readFileSync(resolve(process.cwd(), 'components/search-form.tsx'), 'utf8');

  expect(formSource).toContain('md:grid-cols-[minmax(10rem,1fr)_minmax(8rem,0.7fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto]');
  expect(formSource).toContain('grid min-w-0 gap-2 text-sm font-medium');
});

test('loads and accumulates progressive search batches instead of paginating a local slice', () => {
  const formSource = readFileSync(resolve(process.cwd(), 'components/search-form.tsx'), 'utf8');
  const pageSource = readFileSync(resolve(process.cwd(), 'app/(app)/pesquisa/page.tsx'), 'utf8');

  expect(formSource).toContain('export type SearchResultBatch');
  expect(formSource).toContain('onResults: (batch: SearchResultBatch) => void');
  expect(formSource).toContain('onSearchStart();');
  expect(pageSource).not.toContain('.slice(');
  expect(pageSource).not.toContain('currentPage');
  expect(pageSource).toContain('function handleSearchStart()');
  expect(pageSource).toContain('setSearchId(null);');
  expect(pageSource).toContain('fetch(`/api/search?searchId=${encodeURIComponent(searchId)}`)');
  expect(pageSource).toContain('new Map(previous.map((business) => [business.osmId, business]))');
  expect(pageSource).toContain('Carregar mais empresas');
  expect(pageSource).toContain('Buscando mais empresas…');
});

test('invalidates an in-flight continuation when a new search starts', () => {
  const pageSource = readFileSync(resolve(process.cwd(), 'app/(app)/pesquisa/page.tsx'), 'utf8');

  expect(pageSource).toContain('const searchGeneration = useRef(0);');
  expect(pageSource).toContain('searchGeneration.current += 1;');
  expect(pageSource).toContain('const requestGeneration = searchGeneration.current;');
  expect(pageSource).toContain('if (requestGeneration !== searchGeneration.current) return;');
});
