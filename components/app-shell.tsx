'use client';

import type React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BuildingsIcon,
  ChartBarIcon,
  FunnelIcon,
  SignOutIcon,
  SquaresFourIcon,
  TargetIcon,
  UserCircleIcon
} from '@phosphor-icons/react';

const routes = [
  { href: '/', label: 'Painel', Icon: SquaresFourIcon },
  { href: '/crm', label: 'Funil', Icon: FunnelIcon },
  { href: '/pesquisa', label: 'Empresas', Icon: BuildingsIcon },
  { href: '/metas', label: 'Metas', Icon: TargetIcon },
  { href: '/relatorios', label: 'Relatórios', Icon: ChartBarIcon }
];

function AtelierMark({ className = 'size-9' }: { className?: string }) {
  return <svg className={`${className} shrink-0 text-[var(--atelier-green)]`} viewBox="0 0 40 40" role="img" aria-label="Marca Atelier Approach">
    <path d="M20 2 39 37h-9L20 19 10 37H1L20 2Z" fill="currentColor" />
    <path d="m20 17-6 12h12l-6-12Z" fill="#090d10" />
  </svg>;
}

export function AppShell({ children, user, onSignOut }: { children: React.ReactNode; user: { name: string; email: string }; onSignOut: () => Promise<void> }) {
  const pathname = usePathname();
  const rememberSearchPosition = () => window.dispatchEvent(new Event('atelier:save-search-scroll'));
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AA';

  return <main className="min-h-[100dvh] text-white md:grid md:grid-cols-[176px_minmax(0,1fr)] xl:grid-cols-[196px_minmax(0,1fr)]">
    <aside className="hidden min-h-[100dvh] flex-col border-r border-white/[0.07] bg-[#090d10]/95 px-3 py-6 md:sticky md:top-0 md:flex md:h-[100dvh] md:overflow-y-auto xl:px-4">
      <Link href="/" onClick={rememberSearchPosition} className="flex items-center gap-2.5 px-2">
        <AtelierMark />
        <span className="min-w-0">
          <span className="block text-[17px] font-semibold leading-[1.05] tracking-[-0.045em]">Atelier <span className="text-[var(--atelier-green)]">Approach</span></span>
        </span>
      </Link>
      <nav aria-label="Navegação principal" className="mt-8 grid gap-1">
        {routes.map((route) => {
          const active = route.href === '/' ? pathname === '/' : pathname.startsWith(route.href);
          const Icon = route.Icon;
          return <Link key={route.href} href={route.href} scroll={route.href === '/pesquisa' ? false : undefined} onClick={rememberSearchPosition} aria-current={active ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-r-lg border-l-2 px-3 text-sm transition-colors duration-200 ${active ? 'border-[var(--atelier-green)] bg-[var(--atelier-green)]/[0.08] font-semibold text-[var(--atelier-green)]' : 'border-transparent text-white/55 hover:bg-white/[0.045] hover:text-white'}`}>
            <Icon size={19} weight="regular" aria-hidden="true" />
            <span>{route.label}</span>
          </Link>;
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
          <Link href="/" onClick={rememberSearchPosition} className="flex shrink-0 items-center gap-2 font-semibold tracking-[-0.03em]"><AtelierMark className="size-7" /><span>Atelier <span className="text-[var(--atelier-green)]">Approach</span></span></Link>
          <nav aria-label="Navegação principal" className="flex max-w-[62vw] gap-1 overflow-x-auto text-xs">
            {routes.map((route) => {
              const Icon = route.Icon;
              const active = route.href === '/' ? pathname === '/' : pathname.startsWith(route.href);
              return <Link key={route.href} href={route.href} scroll={route.href === '/pesquisa' ? false : undefined} onClick={rememberSearchPosition} aria-current={active ? 'page' : undefined} className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 ${active ? 'text-[var(--atelier-green)]' : 'text-white/65'}`}>
                <Icon size={14} weight="regular" aria-hidden="true" />
                {route.label}
              </Link>;
            })}
          </nav>
          <Link href="/configuracoes" aria-label="Meu perfil" onClick={rememberSearchPosition} className="shrink-0 rounded-lg p-2 text-[var(--atelier-green)]"><UserCircleIcon size={22} /></Link>
        </div>
      </header>
      {children}
    </div>
  </main>;
}
