import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

test('offers a confirmed return-to-research action that deletes the CRM record', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/lead-detail-modal.tsx'), 'utf8');

  expect(source).not.toContain("window.confirm('Devolver esta empresa para a pesquisa?")
  expect(source).toContain('method: \'DELETE\'');
  expect(source).toContain('Devolver para pesquisa');
  expect(source).toContain('onDeleted(id);');
});

test('keeps the company detail card vertically scrollable on mobile', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/lead-detail-modal.tsx'), 'utf8');

  expect(source).toContain('data-testid="lead-modal-surface" className="atelier-scrollbar starting:translate-y-2');
  expect(source).toContain('flex-col overflow-y-auto overscroll-y-contain touch-pan-y');
  expect(source).toContain("WebkitOverflowScrolling: 'touch'");
});

test('checks for shared funnel changes while the page is visible', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/kanban-board.tsx'), 'utf8');

  expect(source).toContain('/api/crm/board-version');
  expect(source).toContain('setInterval');
  expect(source).toContain('document.visibilityState');
  expect(source).toContain('router.refresh()');
});

test('provides global CRM search and reports matching companies', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/kanban-board.tsx'), 'utf8');

  expect(source).toContain('searchCrmLeads(currentLeads, searchQuery)');
  expect(source).toContain('aria-label="Buscar empresas no CRM"');
  expect(source).toContain('Limpar busca');
  expect(source).toContain('Nenhum resultado nesta etapa');
});
