import Image from 'next/image';

export function BrandLogo({ className = 'w-[150px]', priority = false }: { className?: string; priority?: boolean }) {
  return <span className={`inline-flex shrink-0 flex-col items-start gap-1 ${className}`}>
    <Image
      src="/brand/arvello_approach_com_nome_fundo_preto.png"
      alt="Arvello"
      width={1600}
      height={600}
      priority={priority}
      unoptimized
      className="mix-blend-screen block h-auto w-full"
    />
    <span aria-hidden="true" className="w-full whitespace-nowrap pl-1 text-[8px] font-medium uppercase leading-[1.2] tracking-[0.16em] text-white/40">
      Sua operação comercial
    </span>
  </span>;
}
