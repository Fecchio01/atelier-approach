import Image from 'next/image';

export function BrandLogo({ className = 'w-[150px]', priority = false }: { className?: string; priority?: boolean }) {
  return <span className={`inline-flex shrink-0 flex-col items-start gap-5 ${className}`}>
    <Image
      src="/brand/arvello.svg"
      alt="Arvello"
      width={1225}
      height={310}
      priority={priority}
      unoptimized
      className="block h-auto w-full"
    />
    <span aria-hidden="true" className="w-full whitespace-nowrap pl-1 text-[8px] font-medium uppercase leading-[1.2] tracking-[0.16em] text-white/40">
      Sua operação comercial
    </span>
  </span>;
}
