import Image from 'next/image';
import Link from 'next/link';

interface BrandLogoProps {
  href?: string;
  size?: number;
  className?: string;
  textClassName?: string;
  showText?: boolean;
}

export function BrandLogo({
  href = '/',
  size = 32,
  className = '',
  textClassName = '',
  showText = true,
}: BrandLogoProps) {
  const content = (
    <>
      <Image
        alt=""
        className="shrink-0 rounded-lg"
        height={size}
        priority
        src="/logo-mark-512.png"
        width={size}
      />
      {showText && <span className={textClassName}>Dialect Library</span>}
    </>
  );

  const classes = `inline-flex items-center gap-2.5 font-black no-underline ${className}`.trim();

  if (!href) return <div className={classes}>{content}</div>;

  return (
    <Link aria-label="Dialect Library Community home" className={classes} href={href}>
      {content}
    </Link>
  );
}
