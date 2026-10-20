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

  expect(source).toContain('data-testid="lead-modal-surface"');
  expect(source).toContain('min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain');
  expect(source).toContain("WebkitOverflowScrolling: 'touch'");
});

test('checks for shared funnel changes while the page is visible', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/kanban-board.tsx'), 'utf8');

  expect(source).toContain('/api/crm/board-version');
  expect(source).toContain('setInterval');
  expect(source).toContain('document.visibilityState');
  expect(source).toContain('router.refresh()');
});
