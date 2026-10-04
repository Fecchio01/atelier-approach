import Image from 'next/image';

export function BrandLogo({ className = 'w-36', priority = false }: { className?: string; priority?: boolean }) {
  return <Image
    src="/brand/arvello.svg"
    alt="Arvello"
    width={1500}
    height={620}
    priority={priority}
    unoptimized
    className={`block h-auto shrink-0 ${className}`}
  />;
}
