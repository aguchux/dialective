import Image from 'next/image';
import Link from 'next/link';

interface BrandLogoProps {
  href?: string;
  size?: number;
  className?: string;
  textClassName?: string;
}

export function BrandLogo({ href = '/', size = 40, className = '', textClassName = '' }: BrandLogoProps) {
  const content = (
    <>
      <Image
        src="/logo-mark-512.png"
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-lg"
        priority={size >= 40}
      />
      <span className={textClassName}>Dialect Library</span>
    </>
  );

  const classes = `inline-flex items-center gap-2.5 font-black no-underline ${className}`.trim();

  if (!href) {
    return <div className={classes}>{content}</div>;
  }

  return (
    <Link className={classes} href={href} aria-label="Dialect Library home">
      {content}
    </Link>
  );
}
