'use client';

interface MarqueeCountry {
  code: string;
  name: string;
  _count?: { dialects: number };
}

// Regional-indicator flag emoji don't render as real flag icons on most
// Windows desktop browsers (font-support gap; mobile OSes render them fine),
// so this renders an actual flag image instead of relying on emoji font support.
function flagImageUrl(code: string): string {
  return `https://flagcdn.com/24x18/${code.toLowerCase()}.png`;
}

export function CountryFlagMarquee({ countries }: { countries: MarqueeCountry[] }) {
  if (countries.length === 0) {
    return null;
  }

  // Duplicate the list so the track can loop seamlessly at -50% translate.
  const track = [...countries, ...countries];

  return (
    <section
      className="group -mx-4 overflow-hidden py-4 md:-mx-[3.4rem] md:py-5"
      aria-label="Countries represented on Dialect Library"
    >
      <div className="flex w-max animate-[flag-marquee_38s_linear_infinite] gap-3 group-hover:[animation-play-state:paused]">
        {track.map((country, index) => {
          return (
            <div
              className="flex shrink-0 items-center gap-2 rounded-full border border-[rgba(5,5,5,0.1)] bg-white/75 px-3.5 py-2 text-sm font-bold shadow-[0_8px_18px_rgba(12,20,20,0.06)] backdrop-blur-sm"
              key={`${country.code}-${index}`}
              title={country.name}
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgba(5,5,5,0.05)]"
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- decorative marquee icon; not worth adding a new next/image remotePattern for */}
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  height={18}
                  loading="lazy"
                  src={flagImageUrl(country.code)}
                  width={24}
                />
              </span>
              <span className="whitespace-nowrap text-[rgba(5,5,5,0.72)]">
                {country.name}
                {country._count ? ` (${country._count.dialects})` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
