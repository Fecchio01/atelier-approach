import Image from 'next/image';

export function BrandLogo({ className = 'w-[150px]', priority = false }: { className?: string; priority?: boolean }) {
  return <span className="flex shrink-0 flex-col items-start gap-5">
    <Image
      src="/brand/arvello.svg"
      alt="Arvello"
      width={1225}
      height={310}
      priority={priority}
      unoptimized
      className={`block h-auto ${className}`}
    />
    <span aria-hidden="true" className="whitespace-nowrap pl-1 text-[10px] font-medium uppercase leading-[1.2] tracking-[0.24em] text-white/40">
      Sua operação comercial
    </span>
  </span>;
}
