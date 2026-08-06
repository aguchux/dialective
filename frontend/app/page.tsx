import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

const contributorCards = [
  {
    name: 'Amara O.',
    role: 'Igbo speaker, Enugu',
    gradient: 'from-[#c8dee4] to-[#187d57]',
    initials: 'AO',
  },
  {
    name: 'Tara',
    role: 'Yoruba contributor',
    gradient: 'from-[#d7e3e0] to-[#00806d]',
    initials: 'TA',
  },
  {
    name: 'Andrew',
    role: 'English prompt reviewer',
    gradient: 'from-[#d7f0d6] to-[#6a18a8]',
    initials: 'AN',
  },
  {
    name: 'Mads D.',
    role: 'Hausa language helper',
    gradient: 'from-[#eac4ad] to-[#0f4058]',
    initials: 'MD',
  },
  {
    name: '4 languages',
    role: 'Pilot coverage',
    gradient: 'from-[#68a6dc] to-[#9dc2df]',
    initials: '',
    isStat: true,
  },
  {
    name: 'Cuong N.',
    role: 'Word library contributor',
    gradient: 'from-[#e7c4d1] to-[#92208f]',
    initials: 'CN',
  },
  {
    name: 'Max N.',
    role: 'Dialect recording lead',
    gradient: 'from-[#d4e2dd] to-[#098224]',
    initials: 'MN',
  },
  {
    name: '700+',
    role: 'Seed words ready',
    gradient: 'from-[#e18686] to-[#bd4348]',
    initials: '',
    isStat: true,
  },
];

export default function LandingPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white px-4 pt-4 text-[#050505] md:px-[3.4rem]">
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[min(650px,66vh)] bg-[#c9eff7] bg-cover bg-top bg-fixed bg-no-repeat"
        style={{ backgroundImage: "url('/landing-hero.png')" }}
      />

      <div className="relative z-10">
        <header className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 py-[0.2rem] pb-9 md:pt-0">
          <div className="flex items-center gap-6">
            <Link className="text-2xl font-black no-underline" href="/">
              Dialectiva
            </Link>
            <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
              <Link className="whitespace-nowrap font-bold text-[rgba(5,5,5,0.74)] no-underline" href="/about">
                About Us
              </Link>
              <Link className="whitespace-nowrap font-bold text-[rgba(5,5,5,0.74)] no-underline" href="/blog">
                Blog
              </Link>
              <Link className="whitespace-nowrap font-bold text-[rgba(5,5,5,0.74)] no-underline" href="/faq">
                FAQ
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              className="inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-[#050505] bg-[rgba(255,255,255,0.1)] px-[1.15rem] py-[0.7rem] font-extrabold no-underline"
              href="/login"
            >
              Login
            </Link>
            <Link
              className="inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-[#ff7a34] bg-[#ff7a34] px-[1.15rem] py-[0.7rem] font-extrabold text-[#050505] no-underline"
              href="/register"
            >
              Start Earning
            </Link>
          </div>
        </header>

        <section
          className="mx-auto grid max-w-[760px] gap-5 py-6 pb-9 text-center md:pt-[3.1rem]"
          aria-labelledby="landing-title"
        >
          <h1 id="landing-title" className="text-5xl font-black leading-[1.08] md:text-[4.1rem]">
            Become the voice that AI learns from
          </h1>
          <p className="text-lg font-medium leading-snug text-[rgba(5,5,5,0.68)] md:text-[1.34rem]">
            Contribute short recordings and word translations in your language or dialect. Work from your phone,
            wherever you are. No AI experience needed.
          </p>
          <Link
            className="inline-flex min-h-[42px] min-w-[190px] justify-self-center items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-[#ff7a34] bg-[#ff7a34] px-[1.15rem] py-[0.7rem] font-extrabold text-[#050505] no-underline"
            href="/register"
          >
            Start contributing
          </Link>
        </section>

        <section
          className="-mx-4 overflow-x-auto px-4 pb-9 pt-4 [scrollbar-width:none] md:-mx-[3.4rem] md:px-0 md:py-6 md:pb-[2.8rem] [&::-webkit-scrollbar]:hidden"
          aria-label="Dialectiva contributor preview"
        >
          <div className="grid min-w-max auto-cols-[172px] grid-flow-col items-end gap-4 md:auto-cols-[210px] md:gap-5 md:px-[max(1rem,calc((100vw-1480px)/2))]">
            {contributorCards.map((card, index) => (
              <article
                key={`${card.name}-${card.role}`}
                className={`relative overflow-hidden rounded-lg bg-gradient-to-br p-4 text-white shadow-[0_22px_38px_rgba(12,20,20,0.18)] ${card.gradient} ${
                  card.isStat ? 'aspect-[1.25]' : 'aspect-[0.78]'
                } ${index % 2 === 1 ? 'translate-y-[2.1rem]' : ''} ${index % 3 === 2 ? '-translate-y-4' : ''}`}
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
                    background: 'linear-gradient(180deg, transparent 26%, rgba(0,0,0,0.12) 48%, rgba(0,0,0,0.7) 100%)',
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

        <footer className="-mx-4 grid items-start gap-4 border-t border-[rgba(5,5,5,0.1)] bg-white px-4 py-5 md:-mx-[3.4rem] md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-[3.4rem] md:py-[1.4rem]">
          <div>
            <strong className="mb-1 block text-lg">Dialectiva</strong>
            <p className="leading-snug text-[rgba(5,5,5,0.62)]">
              Voice and word collection for underrepresented dialects. Pilot phase.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-3" aria-label="Footer">
            <Link className="font-bold text-[rgba(5,5,5,0.72)] no-underline" href="/terms">
              Terms of Use
            </Link>
            <Link className="font-bold text-[rgba(5,5,5,0.72)] no-underline" href="/privacy">
              Privacy Policy
            </Link>
            <Link className="font-bold text-[rgba(5,5,5,0.72)] no-underline" href="/cookies">
              Cookie Policy
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
