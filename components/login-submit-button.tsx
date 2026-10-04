'use client';

import { ArrowRightIcon, SpinnerGapIcon } from '@phosphor-icons/react';
import { useFormStatus } from 'react-dom';

export function LoginSubmitButton() {
  const { pending } = useFormStatus();

  return <button
    aria-busy={pending}
    className="group flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--atelier-green)] px-5 font-semibold text-[#101507] transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:bg-[var(--atelier-green-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--atelier-green)] disabled:cursor-wait disabled:opacity-70 lg:min-h-12"
    disabled={pending}
    type="submit"
  >
    {pending
      ? <><SpinnerGapIcon size={18} className="animate-spin" aria-hidden="true" />Entrando...</>
      : <>Entrar <ArrowRightIcon size={18} className="transition-transform duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0" /></>}
  </button>;
}
