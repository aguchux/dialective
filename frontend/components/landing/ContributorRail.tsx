import { contributorCards } from './data';

interface ContributorRailProps {
  dialectCount: number | null;
}

export function ContributorRail({ dialectCount }: ContributorRailProps) {
  const cards = contributorCards.map((card) =>
    card.name === '4 languages' && dialectCount !== null
      ? { ...card, name: `${dialectCount} languages` }
      : card,
  );

  return (
    <section
      className="-mx-4 hidden overflow-x-auto px-4 pb-9 pt-4 [scrollbar-width:none] md:-mx-[3.4rem] md:px-0 md:py-6 md:pb-[2.8rem] [&::-webkit-scrollbar]:hidden"
      aria-label="Dialect Library contributor preview"
    >
      <div className="grid min-w-max auto-cols-[172px] grid-flow-col items-end gap-4 md:auto-cols-[210px] md:gap-5 md:px-[max(1rem,calc((100vw-1480px)/2))]">
        {cards.map((card, index) => (
          <article
            className={`relative overflow-hidden rounded-lg bg-gradient-to-br p-4 text-white shadow-[0_22px_38px_rgba(12,20,20,0.18)] ${card.gradient} ${
              card.isStat ? 'aspect-[1.25]' : 'aspect-[0.78]'
            } ${index % 2 === 1 ? 'translate-y-[2.1rem]' : ''} ${index % 3 === 2 ? '-translate-y-4' : ''}`}
            key={`${card.name}-${card.role}`}
          >
            {!card.isStat && (
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.82]"
                style={{
                  background:
                    'radial-gradient(circle at 50% 22%, rgba(255,255,255,0.84) 0 12%, rgba(255,255,255,0.16) 13% 27%, transparent 28%), radial-gradient(circle at 50% 46%, rgba(255,255,255,0.2) 0 22%, transparent 23%)',
                }}
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, transparent 26%, rgba(0,0,0,0.12) 48%, rgba(0,0,0,0.7) 100%)',
              }}
            />
            <div className="relative grid h-full content-between">
              {card.initials && (
                <div className="relative z-10 h-[3.1rem] w-[3.1rem] justify-self-end rounded-full border border-[rgba(255,255,255,0.38)] bg-[rgba(255,255,255,0.26)] text-center font-black leading-[3.1rem] text-[rgba(255,255,255,0.92)]">
                  {card.initials}
                </div>
              )}
              <div className="relative z-10 grid gap-0.5">
                <strong className="text-2xl leading-none">{card.name}</strong>
                <span className="text-sm font-extrabold leading-tight">{card.role}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
