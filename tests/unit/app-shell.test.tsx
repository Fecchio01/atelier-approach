import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('next/link', async () => {
  const { createElement } = await import('react');
  return {
    default: ({ href, children, scroll: _scroll, prefetch, ...props }: React.PropsWithChildren<{ href: string; scroll?: boolean; prefetch?: boolean }>) =>
      createElement('a', { href, ...props, 'data-prefetch': String(prefetch) }, children)
  };
});

import { AppShell } from '../../components/app-shell';

afterEach(() => vi.unstubAllGlobals());

describe('AppShell brand navigation', () => {
  test('renders the Arvello logo lockup and a distinct icon for every primary destination', () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(
      React.createElement(AppShell, {
        user: { name: 'Carlos Almeida', email: 'carlos@example.com' },
        onSignOut: async () => undefined,
        children: React.createElement('div', null, 'Conteúdo')
      })
    );

    expect(markup).toContain('alt="Arvello"');
    expect(markup).toContain('src="/brand/arvello_approach_com_nome_fundo_preto.png"');
    expect(markup).toContain('mix-blend-screen');
    expect(markup).not.toContain('bg-black');
    expect(markup).toContain('data-atelier-design="apple"');
    expect(markup.match(/Sua operação comercial/g)).toHaveLength(3);
    expect(markup).toContain('xl:w-[150px]');
    expect(markup).toContain('w-full');
    expect(markup).not.toContain('Mais oficinas. Mais negócios.');
    const primaryNavigation = markup.match(/<nav aria-label="Navegação principal" class="[^"]*">([\s\S]*?)<\/nav>/);
    expect(primaryNavigation?.[1]?.match(/<svg\b/g)).toHaveLength(5);
  });

  test('renders a compact mobile header and keeps the desktop navigation separate', () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(
      React.createElement(AppShell, {
        user: { name: 'Carlos Almeida', email: 'carlos@example.com' },
        onSignOut: async () => undefined,
        children: React.createElement('div', null, 'Conteúdo')
      })
    );
    const mobileHeader = markup.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0];
    const mobileDialog = markup.match(/<dialog\b[^>]*>[\s\S]*?<\/dialog>/)?.[0];
    const desktopSidebar = markup.match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)?.[0];
    const desktopNavigation = desktopSidebar?.match(/<nav aria-label="Navegação principal"[^>]*>[\s\S]*?<\/nav>/)?.[0];

    expect(mobileHeader).toContain('aria-label="Abrir menu"');
    expect(mobileHeader).toContain('aria-label="Meu perfil"');
    expect(mobileDialog).toContain('aria-label="Navegação principal no menu mobile"');
    expect(mobileDialog).toContain('Sair da conta');
    expect(desktopSidebar).toContain('aria-label="Navegação principal"');
    expect(desktopSidebar).toContain('Sair da conta');
    expect(desktopSidebar?.match(/<a\b[^>]*aria-current=/g)).toHaveLength(1);
    expect(desktopNavigation?.match(/href="\/(?:crm|pesquisa|metas|relatorios)?"/g)).toHaveLength(5);
  });

  test('does not prefetch every database-backed destination from desktop and mobile navigation', () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(
      React.createElement(AppShell, {
        user: { name: 'Carlos Almeida', email: 'carlos@example.com' },
        onSignOut: async () => undefined,
        children: React.createElement('div', null, 'Conteúdo')
      })
    );
    const desktopNavigation = markup.match(/<nav aria-label="Navegação principal" class="[^"]*">([\s\S]*?)<\/nav>/)?.[1] ?? '';
    const mobileNavigation = markup.match(/<nav aria-label="Navegação principal no menu mobile" class="[^"]*">([\s\S]*?)<\/nav>/)?.[1] ?? '';

    expect(desktopNavigation.match(/data-prefetch="false"/g) ?? []).toHaveLength(5);
    expect(mobileNavigation.match(/data-prefetch="false"/g) ?? []).toHaveLength(5);
  });
});
