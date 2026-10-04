'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CircleNotchIcon, SignOutIcon } from '@phosphor-icons/react';
import { AppNavigationLink } from './app-navigation-link';
import { appRoutes as routes, MobileNavigation } from './mobile-navigation';
import { ReportPeriodNavigationProvider } from './report-period-navigation-state';
import { BrandLogo } from './brand-logo';

export function AppShell({ children, user, onSignOut }: { children: React.ReactNode; user: { name: string; email: string }; onSignOut: () => Promise<void> }) {
  const pathname = usePathname();
  const [pendingNavigation, setPendingNavigation] = useState<{ href: string; label: string } | null>(null);
  const pendingNavigationRef = useRef<string | null>(null);
  const rememberSearchPosition = (href: string, label: string, event: React.MouseEvent<HTMLAnchorElement>) => {
    if (pendingNavigationRef.current === href) {
      event.preventDefault();
      return false;
    }
    pendingNavigationRef.current = href;
    if (href.split('?')[0] === '/pesquisa') window.dispatchEvent(new Event('atelier:save-search-scroll'));
    setPendingNavigation({ href, label });
    return true;
  };

  useEffect(() => {
    if (pendingNavigation && pendingNavigation.href.split('?')[0] === pathname) {
      pendingNavigationRef.current = null;
      setPendingNavigation(null);
    }
  }, [pathname, pendingNavigation]);

  useEffect(() => {
    const clearPending = () => {
      pendingNavigationRef.current = null;
      setPendingNavigation(null);
    };
    window.addEventListener('atelier:navigation-error', clearPending);
    return () => window.removeEventListener('atelier:navigation-error', clearPending);
  }, []);

  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AA';

  return <>
    {pendingNavigation && <div role="status" aria-label="Navegação em andamento" aria-live="polite" className="fixed right-4 top-20 z-[60] inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-[var(--atelier-floating-surface)] px-3.5 text-xs font-medium text-white/75 shadow-lg backdrop-blur-xl backdrop-saturate-150 md:right-6 md:top-5">
      <CircleNotchIcon size={15} className="animate-spin text-[var(--atelier-green)] motion-reduce:animate-none" aria-hidden="true" />
      Abrindo {pendingNavigation.label}…
    </div>}
    <main data-atelier-design="apple" aria-busy={Boolean(pendingNavigation)} className="min-h-[100dvh] text-white md:grid md:grid-cols-[176px_minmax(0,1fr)] xl:grid-cols-[196px_minmax(0,1fr)]">
    <aside data-atelier-material className="hidden min-h-[100dvh] flex-col border-r border-[var(--atelier-line)] bg-[#090d10] px-3 py-6 md:sticky md:top-0 md:flex md:h-[100dvh] md:overflow-y-auto xl:px-4">
      <AppNavigationLink href="/" label="Painel" onNavigationStart={rememberSearchPosition} aria-label="Arvello — painel" className="flex min-h-[62px] items-center px-1">
        <BrandLogo className="w-[136px] xl:w-[150px]" priority />
      </AppNavigationLink>
      <nav aria-label="Navegação principal" className="mt-8 grid gap-1">
        {routes.map((route) => {
          const active = route.href === '/' ? pathname === '/' : pathname.startsWith(route.href);
          const Icon = route.Icon;
          return <AppNavigationLink key={route.href} href={route.href} label={route.label} onNavigationStart={rememberSearchPosition} scroll={route.href === '/pesquisa' ? false : undefined} aria-current={active ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-r-lg border-l-2 px-3 text-sm ${active ? 'border-[var(--atelier-green)] bg-[var(--atelier-green)]/[0.08] font-semibold text-[var(--atelier-green)]' : 'border-transparent text-white/55 hover:bg-white/[0.045] hover:text-white'}`}>
            <Icon size={19} weight="regular" aria-hidden="true" />
            <span>{route.label}</span>
          </AppNavigationLink>;
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 pt-5">
        <AppNavigationLink href="/configuracoes" label="Meu perfil" onNavigationStart={rememberSearchPosition} aria-current={pathname.startsWith('/configuracoes') ? 'page' : undefined} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-white/[0.06]">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--atelier-green)]/15 text-sm font-semibold text-[var(--atelier-green)]">{initials}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{user.name}</span><span className="block truncate text-xs text-white/45">Meu perfil</span></span>
        </AppNavigationLink>
        <form action={onSignOut}><button type="submit" className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/45 hover:bg-white/[0.045] hover:text-white"><SignOutIcon size={16} /> Sair da conta</button></form>
      </div>
    </aside>
    <div className="min-w-0">
      <MobileNavigation
        pathname={pathname}
        user={user}
        onSignOut={onSignOut}
        onNavigationStart={rememberSearchPosition}
        brandLogo={<BrandLogo className="w-[150px]" priority />}
      />
      <ReportPeriodNavigationProvider>{children}</ReportPeriodNavigationProvider>
    </div>
    </main>
  </>;
}
