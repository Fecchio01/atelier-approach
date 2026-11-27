'use client';

import { useRef, useState, type ReactNode } from 'react';
import type { MouseEvent } from 'react';
import { AppNavigationLink } from './app-navigation-link';
import {
  BuildingsIcon,
  ChartBarIcon,
  ChartLineUpIcon,
  DotsThreeIcon,
  FunnelIcon,
  SignOutIcon,
  SquaresFourIcon,
  TargetIcon,
  XIcon
} from '@phosphor-icons/react';
import { ProfileAvatar } from './profile-avatar';
import { DarwinAvatar } from './darwin-avatar';

export const appRoutes = [
  { href: '/', label: 'Painel', Icon: SquaresFourIcon },
  { href: '/financeiro', label: 'Financeiro', Icon: ChartLineUpIcon },
  { href: '/crm', label: 'Funil', Icon: FunnelIcon },
  { href: '/agentes', label: 'Darwin', Icon: DarwinAvatar },
  { href: '/pesquisa', label: 'Empresas', Icon: BuildingsIcon },
  { href: '/metas', label: 'Metas', Icon: TargetIcon },
  { href: '/relatorios', label: 'Relatórios', Icon: ChartBarIcon }
];

const primaryMobileRoutes = [
  { href: '/', label: 'Painel', Icon: SquaresFourIcon },
  { href: '/pesquisa', label: 'Pesquisar', Icon: BuildingsIcon },
  { href: '/crm', label: 'CRM', Icon: FunnelIcon },
  { href: '/agentes', label: 'Darwin', Icon: DarwinAvatar }
];

const secondaryMobileRoutes = appRoutes.filter((route) =>
  !primaryMobileRoutes.some((primaryRoute) => primaryRoute.href === route.href)
);

function routeIsActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function MobileNavigation({
  pathname,
  user,
  onSignOut,
  onNavigationStart,
  brandLogo
}: {
  pathname: string;
  user: { name: string; email: string; image?: string | null };
  onSignOut: () => Promise<void>;
  onNavigationStart: (href: string, label: string, event: MouseEvent<HTMLAnchorElement>) => boolean;
  brandLogo: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  function closeDrawer() {
    if (dialogRef.current?.open) dialogRef.current.close();
    setIsOpen(false);
  }

  function openDrawer() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialog.open) return;
    dialog.showModal();
    setIsOpen(true);
  }

  function closeOnNavigate() {
    closeDrawer();
  }

  const isMoreActive = secondaryMobileRoutes.some((route) => routeIsActive(pathname, route.href)) || pathname.startsWith('/configuracoes');

  return <>
    <header data-atelier-floating className="sticky top-0 z-30 border-b border-[var(--atelier-floating-border)] bg-[var(--atelier-floating-surface)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl backdrop-saturate-150 md:hidden">
      <div className="flex min-h-16 items-center justify-between gap-2 px-4 py-2">
        <AppNavigationLink href="/" label="Painel" onNavigationStart={onNavigationStart} className="flex min-w-0 items-center gap-2 font-semibold tracking-[-0.03em]">
          {brandLogo}
        </AppNavigationLink>
        <AppNavigationLink href="/configuracoes" label="Meu perfil" onNavigationStart={onNavigationStart} aria-label="Meu perfil" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--atelier-green)] hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
          <ProfileAvatar name={user.name} src={user.image} className="size-8 rounded-lg" />
        </AppNavigationLink>
      </div>
    </header>

    <nav aria-label="Navegação principal mobile" data-atelier-floating className="fixed left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 mx-auto max-w-[31rem] rounded-[1.65rem] border border-white/[0.16] bg-[rgba(18,25,22,0.72)] px-1.5 pb-1.5 pt-1.5 shadow-[0_14px_38px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.18)] ring-1 ring-black/10 backdrop-blur-[28px] backdrop-saturate-[180%] md:hidden">
      <div className="mx-auto grid min-h-[3.65rem] grid-cols-5 items-stretch gap-0.5">
        {primaryMobileRoutes.map((route) => {
          const active = routeIsActive(pathname, route.href);
          const Icon = route.Icon;
          return <AppNavigationLink
            key={route.href}
            href={route.href}
            label={route.label}
            onNavigationStart={onNavigationStart}
            scroll={route.href === '/pesquisa' ? false : undefined}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[1.15rem] px-1 text-[10px] leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--atelier-green)] ${active ? 'font-semibold text-[var(--atelier-green)]' : 'text-white/65 hover:bg-white/[0.045] hover:text-white'}`}
          >
            {active && <span aria-hidden="true" className="absolute inset-0 rounded-[1.15rem] bg-white/[0.085] shadow-[inset_0_1px_0_rgba(255,255,255,0.13)]" />}
            <Icon size={20} weight="regular" className="relative z-[1]" aria-hidden="true" />
            <span className="relative z-[1]">{route.label}</span>
          </AppNavigationLink>;
        })}
        <button
          type="button"
          aria-label={isOpen ? 'Mais opções, menu aberto' : 'Mais opções'}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls="mobile-navigation-dialog"
          onClick={openDrawer}
          className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[1.15rem] px-1 text-[10px] leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--atelier-green)] ${isMoreActive ? 'font-semibold text-[var(--atelier-green)]' : 'text-white/65 hover:bg-white/[0.045] hover:text-white'}`}
        >
          {isMoreActive && <span aria-hidden="true" className="absolute inset-0 rounded-[1.15rem] bg-white/[0.085] shadow-[inset_0_1px_0_rgba(255,255,255,0.13)]" />}
          <DotsThreeIcon size={22} weight="bold" className="relative z-[1]" aria-hidden="true" />
          <span className="relative z-[1]">Mais</span>
        </button>
      </div>
    </nav>

    <dialog
      ref={dialogRef}
      id="mobile-navigation-dialog"
      aria-label="Mais opções de navegação"
      onCancel={(event) => { event.preventDefault(); closeDrawer(); }}
      onClose={() => setIsOpen(false)}
      onClick={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest('[data-mobile-navigation-panel]')) closeDrawer();
      }}
      style={{ backgroundColor: 'transparent' }}
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none border-0 p-0 text-white open:block"
    >
      <div className="flex h-full min-h-0">
        <aside data-mobile-navigation-panel data-atelier-floating className="flex h-full w-[min(20rem,calc(100vw-3.5rem))] min-w-0 flex-col border-r border-[var(--atelier-floating-border)] bg-[var(--atelier-floating-surface)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-[12px_0_40px_rgba(0,0,0,0.32)] backdrop-blur-xl backdrop-saturate-150">
          <div className="flex min-h-12 items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
            <AppNavigationLink href="/" label="Painel" onNavigationStart={onNavigationStart} onClick={closeOnNavigate} className="flex min-w-0 items-center gap-2 font-semibold tracking-[-0.03em]">
              {brandLogo}
            </AppNavigationLink>
            <button type="button" aria-label="Fechar menu" onClick={closeDrawer} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
              <XIcon size={21} aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Mais opções" className="mt-5 grid gap-1">
            {secondaryMobileRoutes.map((route) => {
              const active = routeIsActive(pathname, route.href);
              const Icon = route.Icon;
              return <AppNavigationLink
                key={route.href}
                href={route.href}
                label={route.label}
                onNavigationStart={onNavigationStart}
                scroll={route.href === '/pesquisa' ? false : undefined}
                onClick={closeOnNavigate}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 text-sm ${active ? 'border-[var(--atelier-green)] bg-[var(--atelier-green)]/[0.08] font-semibold text-[var(--atelier-green)]' : 'border-transparent text-white/65 hover:bg-white/[0.045] hover:text-white'}`}
              >
                <Icon size={19} weight="regular" aria-hidden="true" />
                <span>{route.label}</span>
              </AppNavigationLink>;
            })}
          </nav>

          <div className="mt-auto border-t border-white/[0.08] pt-4">
            <AppNavigationLink href="/configuracoes" label="Meu perfil" onNavigationStart={onNavigationStart} onClick={closeOnNavigate} aria-current={pathname.startsWith('/configuracoes') ? 'page' : undefined} className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.05]">
              <ProfileAvatar name={user.name} src={user.image} className="rounded-full" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user.name}</span><span className="block truncate text-xs text-white/45">Meu perfil · {user.email}</span></span>
            </AppNavigationLink>
            <form action={onSignOut}>
              <button type="submit" className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-white/55 hover:bg-white/[0.045] hover:text-white">
                <SignOutIcon size={17} weight="regular" aria-hidden="true" />
                Sair da conta
              </button>
            </form>
          </div>
        </aside>
        <div className="min-w-0 flex-1" aria-hidden="true" />
      </div>
    </dialog>
    <style>{`
      #mobile-navigation-dialog {
        opacity: 0;
        transition: opacity var(--atelier-motion-duration) var(--atelier-motion-easing),
          display var(--atelier-motion-duration) allow-discrete,
          overlay var(--atelier-motion-duration) allow-discrete;
      }
      #mobile-navigation-dialog[open] { opacity: 1; }
      #mobile-navigation-dialog::backdrop {
        background: rgba(3, 5, 6, 0);
        transition: background-color var(--atelier-motion-duration) var(--atelier-motion-easing);
      }
      #mobile-navigation-dialog[open]::backdrop { background: rgba(3, 5, 6, 0.75); }
      #mobile-navigation-dialog [data-mobile-navigation-panel] {
        transform: translateX(-12px);
        opacity: 0;
        transition: transform var(--atelier-motion-duration) var(--atelier-motion-easing),
          opacity var(--atelier-motion-duration) var(--atelier-motion-easing);
      }
      #mobile-navigation-dialog[open] [data-mobile-navigation-panel] {
        transform: translateX(0);
        opacity: 1;
      }
      @starting-style {
        #mobile-navigation-dialog[open] { opacity: 0; }
        #mobile-navigation-dialog[open]::backdrop { background: rgba(3, 5, 6, 0); }
        #mobile-navigation-dialog[open] [data-mobile-navigation-panel] {
          transform: translateX(-12px);
          opacity: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        #mobile-navigation-dialog [data-mobile-navigation-panel] {
          transform: none;
          transition: opacity var(--atelier-motion-duration) ease;
        }
      }
      @media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
        #mobile-navigation-dialog::backdrop { background: #030506; }
      }
    `}</style>
  </>;
}
