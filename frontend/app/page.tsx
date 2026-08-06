import Link from 'next/link';

const contributorCards = [
  {
    name: 'Amara O.',
    role: 'Igbo speaker, Enugu',
    tone: 'green',
    initials: 'AO',
  },
  {
    name: 'Tara',
    role: 'Yoruba contributor',
    tone: 'teal',
    initials: 'TA',
  },
  {
    name: 'Andrew',
    role: 'English prompt reviewer',
    tone: 'purple',
    initials: 'AN',
  },
  {
    name: 'Mads D.',
    role: 'Hausa language helper',
    tone: 'blue',
    initials: 'MD',
  },
  {
    name: '4 languages',
    role: 'Pilot coverage',
    tone: 'stat-blue',
    initials: '',
  },
  {
    name: 'Cuong N.',
    role: 'Word library contributor',
    tone: 'magenta',
    initials: 'CN',
  },
  {
    name: 'Max N.',
    role: 'Dialect recording lead',
    tone: 'forest',
    initials: 'MN',
  },
  {
    name: '700+',
    role: 'Seed words ready',
    tone: 'stat-red',
    initials: '',
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/">
          Dialectiva
        </Link>
        <div className="landing-actions">
          <nav className="landing-menu" aria-label="Primary">
            <Link href="/about">About Us</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/faq">FAQ</Link>
          </nav>
          <Link className="landing-login" href="/login">
            Login
          </Link>
          <Link className="landing-primary" href="/register">
            Start Earning
          </Link>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <h1 id="landing-title">Become the voice that AI learns from</h1>
        <p>
          Contribute short recordings and word translations in your language or dialect. Work from your phone, wherever
          you are. No AI experience needed.
        </p>
        <Link className="landing-primary landing-hero-cta" href="/register">
          Start contributing
        </Link>
      </section>

      <section className="contributor-rail" aria-label="Dialectiva contributor preview">
        <div className="rail-track">
          {contributorCards.map((card) => (
            <article className={`contributor-card ${card.tone}`} key={`${card.name}-${card.role}`}>
              {card.initials && <div className="portrait-mark">{card.initials}</div>}
              <div className="card-copy">
                <strong>{card.name}</strong>
                <span>{card.role}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
