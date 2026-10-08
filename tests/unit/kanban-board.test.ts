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

test('keeps the mobile funnel inside a bounded vertical scrollport', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/kanban-board.tsx'), 'utf8');
  const verticalScrollport = source.match(/<section data-testid="crm-main-funnel-scrollport"[^>]*className="([^"]+)"/);
  const horizontalScrollport = source.match(/<div ref=\{funnelScrollRef\} role="region" aria-label="Funil CRM"[\s\S]*?className="([^"]+)"/);

  expect(verticalScrollport?.[1]).toContain('h-[min(68vh,42rem)]');
  expect(verticalScrollport?.[1]).toContain('md:h-auto');
  expect(horizontalScrollport?.[1]).toContain('overflow-x-auto');
  expect(horizontalScrollport?.[1]).toContain('overflow-y-hidden');
});
