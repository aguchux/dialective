import Image from 'next/image';
import Link from 'next/link';

interface BrandLogoProps {
  href?: string;
  size?: number;
  className?: string;
  textClassName?: string;
}

export function BrandLogo({
  href = '/',
  size = 36,
  className = '',
  textClassName = '',
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
      <span className={textClassName}>
        Dialect Library<span className="text-accent"> Stream</span>
      </span>
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
