import Image from 'next/image';
import Link from 'next/link';

type BrandLogoMode = 'inline' | 'stacked';

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
        <span className={`flex flex-col leading-none ${textClassName}`}>
          <span className="text-[1.55rem] font-extrabold tracking-[-0.04em]">Dialect</span>
          <span className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.24em] text-auth-accent">
            Library Stream
          </span>
        </span>
      ) : (
        <span className={textClassName}>
          Dialect Library<span className="text-accent"> Stream</span>
        </span>
      )}
    </>
  );

  const classes = `inline-flex items-center gap-2.5 font-black no-underline ${className}`.trim();

  if (!href) {
    return <div className={classes}>{content}</div>;
  }

  return (
    <Link aria-label="Dialect Library Voice Stream home" className={classes} href={href}>
      {content}
    </Link>
  );
}
