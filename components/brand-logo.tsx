import Image from 'next/image';

export function BrandLogo({ className = 'w-[150px]', priority = false }: { className?: string; priority?: boolean }) {
  return <span className="flex shrink-0 flex-col items-start gap-[2px]">
    <Image
      src="/brand/arvello.svg"
      alt="Arvello"
      width={1225}
      height={310}
      priority={priority}
      unoptimized
      className={`block h-auto ${className}`}
    />
    <span aria-hidden="true" className="whitespace-nowrap text-[6px] font-semibold uppercase leading-[1.2] tracking-[0.18em] text-white/45">
      Sua operação comercial
    </span>
  </span>;
}
