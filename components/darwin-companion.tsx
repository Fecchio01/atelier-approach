'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon, CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { DarwinAvatar } from './darwin-avatar';

export type DarwinMode = 'idle' | 'queued' | 'thinking' | 'working' | 'attention' | 'complete';

type SceneRenderer = typeof import('./darwin-model-scene').DarwinModelScene;

/** Loads the real 3D Darwin only when the companion can be seen. */
export function DarwinCompanion({ mode = 'idle', size = 88, className = '', active = true }: {
  mode?: DarwinMode;
  size?: number;
  className?: string;
  active?: boolean;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [inView, setInView] = useState(false);
  const [Scene, setScene] = useState<SceneRenderer | null>(null);
  const [failed, setFailed] = useState(false);
  const handleUnavailable = useCallback(() => setFailed(true), []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !active || failed) return;

    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(root);
    return () => observer.disconnect();
  }, [active, failed]);

  useEffect(() => {
    if (!inView || !active || Scene || failed) return;
    let cancelled = false;
    void import('./darwin-model-scene').then((module) => {
      if (!cancelled) setScene(() => module.DarwinModelScene);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => { cancelled = true; };
  }, [Scene, active, failed, inView]);

  return <span
    ref={rootRef}
    aria-hidden="true"
    className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-[#f8f3e8] shadow-[0_8px_24px_rgba(0,0,0,.2)] ring-1 ring-black/10 ${mode === 'attention' ? 'ring-amber-300/70' : mode === 'complete' ? 'ring-[var(--atelier-green)]/70' : ''} ${className}`}
    style={{ width: size, height: size }}
  >
    {!active
      ? <DarwinAvatar size={Math.round(size * 0.64)} className="text-[#91d923]" />
      : failed
      ? <DarwinAvatar size={Math.round(size * 0.64)} className="text-[#91d923]" />
      : Scene && active && inView
        ? <Scene mode={mode} onUnavailable={handleUnavailable} />
        : <span className="flex size-8 items-center justify-center rounded-full bg-white/60 text-[#527b46]" aria-hidden="true"><CircleNotchIcon size={17} className="animate-spin motion-reduce:animate-none" /></span>}
    {mode === 'attention' ? <span className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-[#f3c969] text-[#231d0d] ring-2 ring-[#f8f3e8]"><WarningCircleIcon size={14} weight="fill" /></span> : null}
    {mode === 'complete' ? <span className="absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-[var(--atelier-green)] text-[#17200f] ring-2 ring-[#f8f3e8]"><CheckIcon size={13} weight="bold" /></span> : null}
  </span>;
}
