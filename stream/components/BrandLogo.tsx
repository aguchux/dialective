import Image from 'next/image';
import Link from 'next/link';

/**
 * "Stream Dialect" is one brand name, so every mode sets it on a single
 * line -- the modes differ in size and casing, not in structure. They used
 * to stack "Stream" under a "Dialect Library" parent, which only made
 * sense while the product was a sub-brand.
 */
type BrandLogoMode = 'inline' | 'stacked' | 'catalogue';

interface BrandLogoProps {
  href?: string;
  size?: number;
  className?: string;
  textClassName?: string;
  mode?: BrandLogoMode;
}

export function BrandLogo({
  href = '/',
  size = 36,
  className = '',
  textClassName = '',
  mode = 'inline',
}: BrandLogoProps) {
  const content = (
    <>
      <Image
        alt=""
        className="shrink-0"
        height={size}
        priority={size >= 36}
        src="/logo-mark-512.png"
        width={size}
      />
      {mode === 'stacked' ? (
        <span className={`text-[1.55rem] font-extrabold tracking-[-0.04em] ${textClassName}`}>
          <span className="text-auth-accent">Stream</span> Dialect
        </span>
      ) : mode === 'catalogue' ? (
        <span
          className={`text-[0.95rem] font-semibold uppercase tracking-[0.12em] ${textClassName}`}
        >
          <span className="text-catalogue-blue-bright">Stream</span> Dialect
        </span>
      ) : (
        <span className={textClassName}>
          <span className="text-accent">Stream</span> Dialect
        </span>
      )}
    </>
  );

  const classes = `inline-flex items-center gap-2.5 font-black no-underline ${className}`.trim();

  if (!href) {
    return <div className={classes}>{content}</div>;
  }

  return (
    <Link aria-label="Stream Dialect home" className={classes} href={href}>
      {content}
    </Link>
  );
}
