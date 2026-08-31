import { BrandLogo } from './BrandLogo';

/** Shared header for the login/register/accept-invite shells -- brand mark plus a page-specific heading, replacing the three near-identical inline headers those pages used to each define separately. */
export function AuthShellHeader({ title }: { title: string }) {
  return (
    <div className="mb-8 grid justify-items-center gap-3 text-center">
      <BrandLogo href="" size={40} textClassName="text-lg" />
      <h1 className="text-2xl font-black text-ink">{title}</h1>
    </div>
  );
}
