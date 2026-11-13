type DarwinAvatarProps = {
  size?: number | string;
  weight?: string;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
};

/** Distinctive, friendly assistant face used for Darwin's identity. */
export function DarwinAvatar({ size = 24, className, 'aria-hidden': ariaHidden = true }: DarwinAvatarProps) {
  return <svg
    aria-hidden={ariaHidden}
    className={className}
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="24" cy="24" r="22" fill="#18211A" stroke="currentColor" strokeWidth="2" />
    <circle cx="24" cy="24" r="15" fill="currentColor" />
    <ellipse cx="18.5" cy="21.5" rx="2.1" ry="2.8" fill="#111719" />
    <ellipse cx="29.5" cy="21.5" rx="2.1" ry="2.8" fill="#111719" />
    <path d="M18 29C19.5 31.2 21.5 32.3 24 32.3C26.5 32.3 28.5 31.2 30 29" stroke="#111719" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="13.2" cy="12.8" r="1.5" fill="#D7FF71" />
  </svg>;
}
