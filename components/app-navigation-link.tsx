'use client';

import { useState, type ComponentProps, type MouseEvent, type TouchEvent } from 'react';
import Link from 'next/link';

type LinkProps = Omit<ComponentProps<typeof Link>, 'prefetch' | 'onClick'> & {
  label: string;
  onNavigationStart?: (href: string, label: string, event: MouseEvent<HTMLAnchorElement>) => boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onTouchStart?: (event: TouchEvent<HTMLAnchorElement>) => void;
};

export function AppNavigationLink({ href, label, onNavigationStart, onClick, onMouseEnter, onFocus, onTouchStart, ...props }: LinkProps) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false);

  return <Link
    {...props}
    href={href}
    prefetch={shouldPrefetch ? null : false}
    onMouseEnter={(event) => { onMouseEnter?.(event); setShouldPrefetch(true); }}
    onFocus={(event) => { onFocus?.(event); setShouldPrefetch(true); }}
    onTouchStart={(event) => { onTouchStart?.(event); setShouldPrefetch(true); }}
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
