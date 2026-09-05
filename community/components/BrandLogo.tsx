import Image from 'next/image';
import Link from 'next/link';

interface BrandLogoProps {
  href?: string;
  size?: number;
  className?: string;
  textClassName?: string;
}

export function BrandLogo({ href = '/', size = 32, className = '', textClassName = '' }: BrandLogoProps) {
  const content = (
    <>
      <Image alt="" className="shrink-0" height={size} priority src="/logo-mark-512.png" width={size} />
      <span className={textClassName}>
        Dialect Library<span className="text-accent"> Community</span>
      </span>
    </>
  );

  const classes = `inline-flex items-center gap-2.5 font-black no-underline ${className}`.trim();

  return (
    <Link aria-label="Dialect Library Community home" className={classes} href={href}>
      {content}
    </Link>
  );
}
