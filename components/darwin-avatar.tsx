type DarwinAvatarProps = {
  size?: number | string;
  weight?: string;
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
};

/** Flat 2D Darwin (sprout, capsule head, visor and mint eyes). Tinted by `currentColor`. */
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
    {/* sprout */}
    <path d="M24 14.5V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M24 11C24 6.6 20.6 4 15.5 4.6C15.4 9.4 18.7 12 24 11Z" fill="currentColor" />
    <path d="M24 11C24 6.6 27.4 4 32.5 4.6C32.6 9.4 29.3 12 24 11Z" fill="currentColor" opacity="0.72" />
    {/* side pods */}
    <rect x="2.5" y="26" width="5" height="9" rx="2.5" fill="currentColor" opacity="0.72" />
    <rect x="40.5" y="26" width="5" height="9" rx="2.5" fill="currentColor" opacity="0.72" />
    {/* head */}
    <rect x="6" y="14.5" width="36" height="29" rx="11" fill="currentColor" />
    {/* visor */}
    <rect x="10.5" y="19" width="27" height="20" rx="7.5" fill="#0c1a11" />
    <path d="M14.5 22.5C16 21.4 18 21 20 21" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
    {/* eyes */}
    <rect x="16.5" y="25" width="5" height="9" rx="2.5" fill="#92ffc0" />
    <rect x="26.5" y="25" width="5" height="9" rx="2.5" fill="#92ffc0" />
  </svg>;
}
