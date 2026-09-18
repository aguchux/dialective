/**
 * A country flag as an IMAGE, not an emoji.
 *
 * Regional-indicator flag emoji (the two-codepoint pairs countryFlagEmoji
 * builds) have no glyph in the fonts shipped with Windows, so Chrome and
 * Edge on desktop fall back to drawing the raw letters -- a market row for
 * Nigeria renders a literal "NG" instead of a flag. Mobile renders them
 * fine, which is why this is easy to miss in testing.
 *
 * CountryFlagMarquee already worked around this with flagcdn images; this
 * is that same approach as a shared component so every flag in the app
 * renders identically on every platform.
 */
export function CountryFlag({
  code,
  name,
  className = '',
}: {
  code: string | null | undefined;
  /** Used as the tooltip/alt text. The flag is decorative when a visible label sits next to it. */
  name?: string | null;
  className?: string;
}) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) {
    // No usable code: a globe keeps the row's alignment rather than
    // collapsing the column to nothing.
    return (
      <span aria-hidden="true" className={className}>
        🌐
      </span>
    );
  }

  const lower = code.toLowerCase();
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative flag icon; not worth a next/image remotePattern for a 20px asset
    <img
      alt=""
      aria-hidden="true"
      className={`inline-block h-[13px] w-[18px] shrink-0 rounded-[2px] object-cover align-[-1px] ${className}`}
      height={13}
      loading="lazy"
      // 2x source for crisp rendering on retina displays.
      src={`https://flagcdn.com/36x27/${lower}.png`}
      title={name ?? undefined}
      width={18}
    />
  );
}
