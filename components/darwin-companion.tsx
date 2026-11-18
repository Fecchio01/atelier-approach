'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, WarningCircleIcon } from '@phosphor-icons/react';

export type DarwinMode = 'idle' | 'working' | 'attention' | 'complete';

/** A lightweight visual companion; activity is supplied by the real chat or campaign state. */
export function DarwinCompanion({ mode = 'idle', size = 44, className = '' }: {
  mode?: DarwinMode;
  size?: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMotionAllowed(!preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (mode !== 'working' || !motionAllowed) {
      video.pause();
      video.currentTime = 0;
      return;
    }

    video.currentTime = 0;
    void video.play().catch(() => {
      // The still poster remains visible when autoplay is unavailable.
    });
  }, [mode, motionAllowed]);

  return <span
    aria-hidden="true"
    className={`relative inline-flex shrink-0 overflow-hidden rounded-[14px] bg-[#f6f1e7] ring-1 ring-black/10 ${mode === 'attention' ? 'ring-amber-300/60' : mode === 'complete' ? 'ring-[var(--atelier-green)]/60' : ''} ${className}`}
    style={{ width: size, height: size }}
  >
    {/* The source artwork is 4:3; a centered crop keeps the face legible in compact UI. */}
    <img src="/darwin/darwin-v8-poster.webp" alt="" className="absolute inset-0 size-full object-cover" />
    <video
      ref={videoRef}
      muted
      playsInline
      preload="none"
      poster="/darwin/darwin-v8-poster.webp"
      onPlay={() => setAnimationFinished(false)}
      onEnded={(event) => { event.currentTarget.pause(); setAnimationFinished(true); }}
      className={`absolute inset-0 size-full object-cover transition-opacity duration-200 motion-reduce:transition-none ${mode === 'working' && motionAllowed && !animationFinished ? 'opacity-100' : 'opacity-0'}`}
    >
      <source src="/darwin/darwin-v8-float.webm" type="video/webm" />
    </video>
    {mode === 'attention' ? <span className="absolute bottom-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-[#f3c969] text-[#231d0d] ring-2 ring-[#f6f1e7]"><WarningCircleIcon size={12} weight="fill" /></span> : null}
    {mode === 'complete' ? <span className="absolute bottom-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--atelier-green)] text-[#17200f] ring-2 ring-[#f6f1e7]"><CheckIcon size={11} weight="bold" /></span> : null}
  </span>;
}
