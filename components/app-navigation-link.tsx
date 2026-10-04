'use client';

import { useEffect, useRef, useState, type ComponentProps, type MouseEvent } from 'react';
import Link from 'next/link';

type LinkProps = Omit<ComponentProps<typeof Link>, 'prefetch' | 'onClick'> & {
  label: string;
  onNavigationStart?: (href: string, label: string, event: MouseEvent<HTMLAnchorElement>) => boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export function AppNavigationLink({ href, label, onNavigationStart, onClick, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props }: LinkProps) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
  }, []);

  function scheduleIntentPrefetch() {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = setTimeout(() => setShouldPrefetch(true), 160);
  }

  function cancelIntentPrefetch() {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
    setShouldPrefetch(false);
  }

  return <Link
    {...props}
    href={href}
    prefetch={shouldPrefetch ? null : false}
    onMouseEnter={(event) => { onMouseEnter?.(event); scheduleIntentPrefetch(); }}
    onMouseLeave={(event) => { onMouseLeave?.(event); cancelIntentPrefetch(); }}
    onFocus={(event) => { onFocus?.(event); scheduleIntentPrefetch(); }}
    onBlur={(event) => { onBlur?.(event); cancelIntentPrefetch(); }}
    onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = new URL(typeof href === 'string' ? href : href.pathname ?? '/', window.location.href);
      const current = new URL(window.location.href);
      if (destination.pathname === current.pathname && destination.search === current.search) {
        event.preventDefault();
        return;
      }
      if (onNavigationStart && !onNavigationStart(`${destination.pathname}${destination.search}`, label, event)) event.preventDefault();
    }}
  />;
}
