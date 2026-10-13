'use client';

import { useState } from 'react';
import Image from 'next/image';

export function ProfileAvatar({ name, src, className = '' }: { name: string; src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('pt-BR')).join('') || 'AA';

  return <span role="img" aria-label={`${name || 'Perfil'}: foto de perfil`} className={`relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--atelier-green)]/15 text-sm font-semibold text-[var(--atelier-green)] ${className}`}>
    {src && !failed ? <Image src={src} alt="" width={40} height={40} unoptimized onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" /> : initials}
  </span>;
}
