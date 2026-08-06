import Link from 'next/link';

const steps = [
  {
    title: 'Pick your language',
    body: 'Choose the language or dialect you can speak naturally.',
  },
  {
    title: 'Record short tasks',
    body: 'Contribute sentence recordings or word translations from your phone.',
  },
  {
    title: 'Reviewed for rewards',
    body: 'Submissions are checked before they count toward pilot rewards.',
  },
];

const languages = ['English', 'Igbo', 'Yoruba', 'Hausa'];

export default function LandingPage() {
  return (
    <main className="page-shell">
      <header className="site-header">
        <div className="brand">Dialectiva</div>
        <nav className="nav-actions" aria-label="Primary">
          <Link className="button secondary" href="/login">
            Log in
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Pilot voice collection</p>
          <h1>Dialectiva</h1>
          <p className="lede">Contribute voice and word recordings for your language and dialect.</p>
          <div className="cta-row">
            <Link className="button" href="/register">
              Create account
            </Link>
            <Link className="button secondary" href="/login">
              Log in
            </Link>
          </div>
        </div>

        <aside className="hero-panel" aria-label="Contribution preview">
          <p className="eyebrow">Today&apos;s task</p>
          <div className="prompt-preview">
            <strong>Record a prompt</strong>
            <span>Read one short sentence in your natural speaking voice.</span>
          </div>
          <div className="meter" aria-hidden="true">
            <span />
          </div>
          <p className="notice">Built for quick mobile contributions during the pilot.</p>
        </aside>
      </section>

      <section className="section" aria-labelledby="how-it-works">
        <h2 id="how-it-works">How it works</h2>
        <div className="steps">
          {steps.map((step, index) => (
            <article className="step" key={step.title}>
              <span className="step-number">{index + 1}</span>
              <h3>{step.title}</h3>
              <p className="notice">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="supported-languages">
        <h2 id="supported-languages">Supported languages</h2>
        <div className="language-grid">
          {languages.map((language) => (
            <div className="language-pill" key={language}>
              {language}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <p className="pilot-note">Dialectiva is currently in pilot. Account access and contribution tasks may change as validation and reward flows mature.</p>
      </section>

      <footer className="site-footer">
        <Link href="/login">Log in</Link>
        <Link href="/register">Create account</Link>
        <Link href="/pipeline-test">Pipeline test</Link>
      </footer>
    </main>
  );
}
