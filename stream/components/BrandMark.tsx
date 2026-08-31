/**
 * Voice Stream's brand mark: the same waveform motif as the trainer app's
 * logo (frontend/public/logo-mark-512.png), redrawn in Stream's own
 * indigo/cyan palette -- this product is deliberately a distinct visual
 * identity from the trainer dashboard (see app/globals.css's palette
 * comment), so it reuses the *idea* (voice data, as a waveform) rather than
 * the trainer app's purple asset.
 */
export function BrandMark({
  size = 32,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 32 32"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#12131f" height="32" rx="8" width="32" />
      <path
        d="M4 16h3M7 16v-3M7 13v-3M10 16v-6M10 10v6M13 16V7M13 7v9M16 16V4M16 4v12M19 16V7M19 7v9M22 16v-6M22 10v6M25 16v-3M25 13v-3M28 16h-3"
        stroke="url(#stream-mark-gradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="stream-mark-gradient"
          x1="4"
          x2="28"
          y1="16"
          y2="16"
        >
          <stop stopColor="#2f6fed" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  );
}
