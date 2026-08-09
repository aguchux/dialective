'use client';

interface MarqueeCountry {
  code: string;
  name: string;
}

function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export function CountryFlagMarquee({ countries }: { countries: MarqueeCountry[] }) {
  if (countries.length === 0) {
    return null;
  }

  // Duplicate the list so the track can loop seamlessly at -50% translate.
  const track = [...countries, ...countries];

  return (
    <section className="group -mx-4 overflow-hidden py-4 md:-mx-[3.4rem] md:py-5" aria-label="Countries represented on Dialect Library">
      <div className="flex w-max animate-[flag-marquee_38s_linear_infinite] gap-3 group-hover:[animation-play-state:paused]">
        {track.map((country, index) => (
          <div
            className="flex shrink-0 items-center gap-2 rounded-full border border-[rgba(5,5,5,0.1)] bg-white/75 px-3.5 py-2 text-sm font-bold shadow-[0_8px_18px_rgba(12,20,20,0.06)] backdrop-blur-sm"
            key={`${country.code}-${index}`}
            title={country.name}
          >
            <span className="text-lg leading-none bg-[rgba(5,5,5,0.05)] rounded-full p-1 flex items-center justify-center" aria-hidden="true">
              {flagEmoji(country.code)}
            </span>
            <span className="whitespace-nowrap text-[rgba(5,5,5,0.72)]">{country.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
