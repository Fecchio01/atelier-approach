'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  BuildingsIcon,
  ChartBarIcon,
  FunnelIcon,
  ListIcon,
  SignOutIcon,
  SquaresFourIcon,
  TargetIcon,
  UserCircleIcon,
  XIcon
} from '@phosphor-icons/react';

export const appRoutes = [
  { href: '/', label: 'Painel', Icon: SquaresFourIcon },
  { href: '/crm', label: 'Funil', Icon: FunnelIcon },
  { href: '/pesquisa', label: 'Empresas', Icon: BuildingsIcon },
  { href: '/metas', label: 'Metas', Icon: TargetIcon },
  { href: '/relatorios', label: 'Relatórios', Icon: ChartBarIcon }
];

function routeIsActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function MobileNavigation({
  pathname,
  user,
  onSignOut,
  onNavigate,
  brandMark
}: {
  pathname: string;
  user: { name: string; email: string };
  onSignOut: () => Promise<void>;
  onNavigate: () => void;
  brandMark: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AA';

  function closeDrawer() {
    if (dialogRef.current?.open) dialogRef.current.close();
    setIsOpen(false);
  }

  function toggleDrawer() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialog.open) {
      closeDrawer();
      return;
    }
    dialog.showModal();
    setIsOpen(true);
  }

  function navigate() {
    closeDrawer();
    onNavigate();
  }

  return <>
    <header data-atelier-floating className="sticky top-0 z-30 border-b border-[var(--atelier-floating-border)] bg-[var(--atelier-floating-surface)] backdrop-blur-md md:hidden">
      <div className="flex min-h-16 items-center justify-between gap-2 px-4 py-2">
        <Link href="/" prefetch={false} onClick={onNavigate} className="flex min-w-0 items-center gap-2 font-semibold tracking-[-0.03em]">
          {brandMark}
          <span className="truncate text-sm">Atelier <span className="text-[var(--atelier-green)]">Approach</span></span>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={isOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation-dialog"
            onClick={toggleDrawer}
            className="flex size-11 items-center justify-center rounded-lg text-white/75 hover:bg-white/[0.06] hover:text-[var(--atelier-green)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]"
          >
            {isOpen ? <XIcon size={22} aria-hidden="true" /> : <ListIcon size={22} aria-hidden="true" />}
          </button>
          <Link href="/configuracoes" prefetch={false} aria-label="Meu perfil" onClick={onNavigate} className="flex size-11 items-center justify-center rounded-lg text-[var(--atelier-green)] hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
            <UserCircleIcon size={23} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>

    <dialog
      ref={dialogRef}
      id="mobile-navigation-dialog"
      aria-label="Navegação principal no menu mobile"
      onCancel={(event) => { event.preventDefault(); closeDrawer(); }}
      onClose={() => setIsOpen(false)}
      onClick={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest('[data-mobile-navigation-panel]')) closeDrawer();
      }}
      style={{ backgroundColor: 'transparent' }}
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none border-0 p-0 text-white open:block"
    >
      <div className="flex h-full min-h-0">
        <aside data-mobile-navigation-panel data-atelier-floating className="flex h-full w-[min(20rem,calc(100vw-3.5rem))] min-w-0 flex-col border-r border-[var(--atelier-floating-border)] bg-[var(--atelier-floating-surface)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shadow-[12px_0_40px_rgba(0,0,0,0.24)]">
          <div className="flex min-h-12 items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
            <Link href="/" prefetch={false} onClick={navigate} className="flex min-w-0 items-center gap-2 font-semibold tracking-[-0.03em]">
              {brandMark}
              <span className="truncate text-sm">Atelier <span className="text-[var(--atelier-green)]">Approach</span></span>
            </Link>
            <button type="button" aria-label="Fechar menu" onClick={closeDrawer} className="flex size-11 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--atelier-green)]">
              <XIcon size={21} aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Navegação principal no menu mobile" className="mt-5 grid gap-1">
            {appRoutes.map((route) => {
              const active = routeIsActive(pathname, route.href);
              const Icon = route.Icon;
              return <Link
                key={route.href}
                href={route.href}
                prefetch={false}
                scroll={route.href === '/pesquisa' ? false : undefined}
                onClick={navigate}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg border-l-2 px-3 text-sm ${active ? 'border-[var(--atelier-green)] bg-[var(--atelier-green)]/[0.08] font-semibold text-[var(--atelier-green)]' : 'border-transparent text-white/65 hover:bg-white/[0.045] hover:text-white'}`}
              >
                <Icon size={19} weight="regular" aria-hidden="true" />
                <span>{route.label}</span>
              </Link>;
            })}
          </nav>

          <div className="mt-auto border-t border-white/[0.08] pt-4">
            <Link href="/configuracoes" prefetch={false} onClick={navigate} aria-current={pathname.startsWith('/configuracoes') ? 'page' : undefined} className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.05]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--atelier-green)]/15 text-sm font-semibold text-[var(--atelier-green)]">{initials}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{user.name}</span><span className="block truncate text-xs text-white/45">Meu perfil · {user.email}</span></span>
            </Link>
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
      #mobile-navigation-dialog::backdrop { background: rgba(3, 5, 6, 0.75); }
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
        #mobile-navigation-dialog[open] [data-mobile-navigation-panel] {
          transform: translateX(-12px);
          opacity: 0;
        }
      }
      @media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
        #mobile-navigation-dialog::backdrop { background: #030506; }
      }
    `}</style>
  </>;
}
