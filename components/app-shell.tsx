'use client';

import type React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutIcon, UserCircleIcon } from '@phosphor-icons/react';

const routes = [
  { href: '/', label: 'Painel' },
  { href: '/crm', label: 'Funil' },
  { href: '/pesquisa', label: 'Empresas' },
  { href: '/metas', label: 'Metas' },
  { href: '/relatorios', label: 'Relatórios' }
];

export function AppShell({ children, user, onSignOut }: { children: React.ReactNode; user: { name: string; email: string }; onSignOut: () => Promise<void> }) {
  const pathname = usePathname();
  const rememberSearchPosition = () => window.dispatchEvent(new Event('atelier:save-search-scroll'));
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AA';

  return <main className="min-h-[100dvh] text-white md:grid md:grid-cols-[210px_minmax(0,1fr)]">
    <aside className="hidden min-h-[100dvh] flex-col border-r border-white/[0.07] bg-[#090d10]/85 px-4 py-7 md:sticky md:top-0 md:flex md:h-[100dvh] md:overflow-y-auto">
      <Link href="/" onClick={rememberSearchPosition} className="block px-3">
        <span className="block text-xl font-semibold tracking-[-0.045em]">Atelier <span className="text-[var(--atelier-green)]">Approach</span></span>
        <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.24em] text-white/40">Mais oficinas. Mais negócios.</span>
      </Link>
      <nav aria-label="Navegação principal" className="mt-9 grid gap-1">
        {routes.map((route) => {
          const active = route.href === '/' ? pathname === '/' : pathname.startsWith(route.href);
          return <Link key={route.href} href={route.href} scroll={route.href === '/pesquisa' ? false : undefined} onClick={rememberSearchPosition} aria-current={active ? 'page' : undefined} className={`rounded-lg border-l-2 px-3 py-3 text-sm ${active ? 'border-[var(--atelier-green)] bg-white/[0.055] font-semibold text-[var(--atelier-green)]' : 'border-transparent text-white/50 hover:bg-white/[0.045] hover:text-white'}`}>{route.label}</Link>;
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 pt-5">
        <Link href="/configuracoes" onClick={rememberSearchPosition} aria-current={pathname.startsWith('/configuracoes') ? 'page' : undefined} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.06]">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/15 text-sm font-semibold text-[var(--atelier-green)]">{initials}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{user.name}</span><span className="block truncate text-xs text-white/45">Meu perfil</span></span>
        </Link>
        <form action={onSignOut}><button type="submit" className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/45 hover:bg-white/[0.045] hover:text-white"><SignOutIcon size={16} /> Sair da conta</button></form>
      </div>
    </aside>
    <div className="min-w-0">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#090d10]/80 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <Link href="/" onClick={rememberSearchPosition} className="font-semibold tracking-[-0.03em]">Atelier <span className="text-[var(--atelier-green)]">Approach</span></Link>
          <nav aria-label="Navegação principal" className="flex max-w-[62vw] gap-1 overflow-x-auto text-xs">
            {routes.map((route) => <Link key={route.href} href={route.href} scroll={route.href === '/pesquisa' ? false : undefined} onClick={rememberSearchPosition} className="shrink-0 rounded-md px-2 py-1.5 text-white/65">{route.label}</Link>)}
          </nav>
          <Link href="/configuracoes" aria-label="Meu perfil" onClick={rememberSearchPosition} className="shrink-0 rounded-lg p-2 text-[var(--atelier-green)]"><UserCircleIcon size={22} /></Link>
        </div>
      </header>
      {children}
    </div>
  </main>;
}
