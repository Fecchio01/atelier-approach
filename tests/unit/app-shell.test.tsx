import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ href, children, scroll: _scroll, ...props }: React.PropsWithChildren<{ href: string; scroll?: boolean }>) =>
      createElement('a', { href, ...props }, children)
  };
});

import { AppShell } from '../../components/app-shell';

afterEach(() => vi.unstubAllGlobals());

describe('AppShell brand navigation', () => {
  test('renders the Atelier mark and a distinct icon for every primary destination', () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(
      React.createElement(AppShell, {
        user: { name: 'Carlos Almeida', email: 'carlos@example.com' },
        onSignOut: async () => undefined,
        children: React.createElement('div', null, 'Conteúdo')
      })
    );

    expect(markup).toContain('role="img" aria-label="Marca Atelier Approach"');
    const primaryNavigation = markup.match(/<nav aria-label="Navegação principal" class="[^"]*">([\s\S]*?)<\/nav>/);
    expect(primaryNavigation?.[1]?.match(/<svg\b/g)).toHaveLength(5);
  });
});
