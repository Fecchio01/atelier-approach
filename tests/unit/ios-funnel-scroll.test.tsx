import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@phosphor-icons/react', () => ({ ArrowsLeftRightIcon: () => null, TrashIcon: () => null }));

import { KanbanBoard } from '../../components/kanban-board';

describe('iOS CRM funnel scroll structure', () => {
  test('leaves vertical movement to the mobile page while preserving a bounded desktop funnel', () => {
    const markup = renderToStaticMarkup(React.createElement(KanbanBoard, {
      leads: [], services: [], followUpDelayDays: 2
    }));
    const verticalScrollport = markup.match(/<section data-testid="crm-main-funnel-scrollport"[^>]*class="([^"]+)"/);

    expect(verticalScrollport?.[1]).toContain('h-auto max-h-none overflow-y-visible');
    expect(verticalScrollport?.[1]).toContain('md:h-auto md:max-h-[min(68dvh,42rem)] md:overflow-y-auto');
    expect(markup).toContain('aria-label="Etapas principais do funil" tabindex="0"');
    expect(markup).toContain('aria-label="Funil CRM" tabindex="0"');
    expect(markup).toContain('aria-label="Funil CRM"');
    expect(markup).toContain('overflow-x-auto');
  });
});
