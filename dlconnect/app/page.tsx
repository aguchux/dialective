'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Globe2,
  Menu,
  MessageCircle,
  Mic2,
  MonitorPlay,
  Play,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';

type Country = { code: string; name: string };
type Stats = { interested: number; speakerApplicants: number; countries: number };
type Interest = 'attend' | 'speak';

const slides = ['/images/connect-hero-1.png', '/images/connect-hero-2.png'];

const agenda = [
  { time: 'Opening', title: 'Welcome to Connect', detail: 'Meet the contributor community.', icon: Play },
  { time: 'Stories', title: 'Contributor voices', detail: 'Real people and local impact.', icon: UsersRound },
  { time: 'Ideas', title: 'Building better voice AI', detail: 'Language, data, and inclusion.', icon: Sparkles },
  { time: 'Discussion', title: 'Live Q&A', detail: 'Ask, learn, and connect.', icon: CircleHelp },
];

const speakerThemes = [
  { title: 'Language & culture', detail: 'Voices from under-represented languages.', position: '62% 44%' },
  { title: 'Contributor stories', detail: 'The people behind the recordings.', position: '47% 44%' },
  { title: 'Inclusive AI', detail: 'Building technology for more people.', position: '79% 44%' },
  { title: 'Community impact', detail: 'What happens when more voices are heard.', position: '96% 44%' },
];

function Brand() {
  return (
    <a className="brand" href="#top" aria-label="Dialect Library Connect home">
      <img alt="" src="/logo-mark.png" width="35" height="35" />
      <span>
        <strong>Dialect Library</strong>
        <small>More Voices A Brighter Tomorrow</small>
      </span>
    </a>
  );
}

function errorMessage(data: { message?: string | string[] }): string {
  if (Array.isArray(data.message)) return data.message[0] ?? 'Please check your details.';
  return data.message ?? 'Could not submit. Please try again.';
}

export default function Home() {
  const [slide, setSlide] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [speakerOpen, setSpeakerOpen] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [attendStatus, setAttendStatus] = useState('');
  const [speakerStatus, setSpeakerStatus] = useState('');
  const [attendBusy, setAttendBusy] = useState(false);
  const [speakerBusy, setSpeakerBusy] = useState(false);

  async function loadData() {
    try {
      const response = await fetch('/api/connect', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { stats: Stats; countries: Country[] };
      setStats(data.stats);
      setCountries(data.countries);
    } catch {
      // Forms will report an error if the API is still unavailable on submission.
    }
  }

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slides.length), 7500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!speakerOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSpeakerOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [speakerOpen]);

  function navigateSlide(direction: -1 | 1) {
    setSlide((current) => (current + direction + slides.length) % slides.length);
  }

  async function submit(event: FormEvent<HTMLFormElement>, interest: Interest) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const setBusy = interest === 'attend' ? setAttendBusy : setSpeakerBusy;
    const setStatus = interest === 'attend' ? setAttendStatus : setSpeakerStatus;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(formData.get('name') ?? ''),
          email: String(formData.get('email') ?? ''),
          countryCode: String(formData.get('countryCode') ?? ''),
          interest,
          consent: formData.get('consent') === 'on',
          website: String(formData.get('website') ?? ''),
          ...(interest === 'speak'
            ? {
                speakerTopic: String(formData.get('speakerTopic') ?? ''),
                speakerSummary: String(formData.get('speakerSummary') ?? ''),
              }
            : {}),
        }),
      });
      const data = (await response.json()) as { message?: string | string[] };
      if (!response.ok) throw new Error(errorMessage(data));
      setStatus(
        interest === 'attend'
          ? 'You are on the interest list. We will email event details when confirmed.'
          : 'Speaker application received. Our team will review it and contact you by email.',
      );
      form.reset();
      void loadData();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not submit. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="site-header" id="top">
        <div className="header-inner content-width">
          <Brand />
          <nav className={mobileMenuOpen ? 'site-nav open' : 'site-nav'} aria-label="Main navigation">
            <a href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
            <a href="#speakers" onClick={() => setMobileMenuOpen(false)}>Speakers</a>
            <a href="#schedule" onClick={() => setMobileMenuOpen(false)}>Schedule</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)}>FAQ</a>
          </nav>
          <div className="header-actions">
            <button className="button button-outline" onClick={() => setSpeakerOpen(true)} type="button">
              Apply to Speak
            </button>
            <a className="button button-primary" href="#register">Register Free</a>
          </div>
          <button
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="menu-toggle"
            onClick={() => setMobileMenuOpen((open) => !open)}
            type="button"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="about" aria-label="Dialect Library Connect 2026">
          <div className="hero-art" aria-hidden="true">
            <div className="hero-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
              {slides.map((source) => (
                <div className="hero-image" key={source} style={{ backgroundImage: `url(${source})` }} />
              ))}
            </div>
          </div>
          <button className="hero-arrow hero-arrow-left" type="button" onClick={() => navigateSlide(-1)} aria-label="Previous banner">
            <ChevronLeft size={28} />
          </button>
          <button className="hero-arrow hero-arrow-right" type="button" onClick={() => navigateSlide(1)} aria-label="Next banner">
            <ChevronRight size={28} />
          </button>
          <div className="hero-content content-width">
            <p className="eyebrow">People <span /> Languages <span /> More inclusive AI</p>
            <h1>DIALECT LIBRARY<br /><em>CONNECT</em> 2026</h1>
            <p className="hero-subtitle">Our First Contributor Webinar</p>
            <p className="hero-date">October 2026 · Online</p>
            <p className="hero-description">Meet the voices building inclusive AI, learn what&apos;s next, and connect with the Dialect Library community.</p>
            <div className="hero-actions">
              <a className="button button-glow" href="#register">Register to Attend <ArrowRight size={17} /></a>
              <button className="button button-ghost" onClick={() => setSpeakerOpen(true)} type="button">Apply to Speak</button>
            </div>
            <div className="hero-dots" aria-label="Banner selection">
              {slides.map((source, index) => (
                <button key={source} type="button" className={slide === index ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`Show banner ${index + 1}`} aria-current={slide === index ? 'true' : undefined} />
              ))}
            </div>
          </div>
          <div className="stats-bar content-width" aria-label="Event interest">
            <div className="stat-primary"><div className="avatar-stack" aria-hidden="true"><span /><span /><span /><span /></div><p><strong>{stats ? stats.interested.toLocaleString() : '—'}</strong><small>Interested contributors</small></p></div>
            <div className="stat"><Globe2 /><p><strong>{stats ? stats.countries.toLocaleString() : '—'}</strong><small>Countries represented</small></p></div>
            <div className="stat"><Mic2 /><p><strong>{stats ? stats.speakerApplicants.toLocaleString() : '—'}</strong><small>Speaker applicants</small></p></div>
            <div className="stat"><MessageCircle /><p><strong>Live Q&amp;A</strong><small>Ask. Learn. Connect.</small></p></div>
          </div>
        </section>

        <section className="speaker-section content-width" id="speakers">
          <div className="section-topline"><span className="section-kicker">Featured speakers</span><span className="line" /></div>
          <div className="section-heading"><div><h2>Meet the voices of Connect</h2><p>Contributors, researchers, and community builders will lead the conversation.</p></div><button className="text-link" onClick={() => setSpeakerOpen(true)} type="button">Apply to join the lineup <ArrowRight size={16} /></button></div>
          <div className="speaker-grid">
            {speakerThemes.map((theme) => (
              <article className="speaker-card" key={theme.title}>
                <div className="speaker-portrait" style={{ backgroundPosition: theme.position }} aria-hidden="true" />
                <div className="speaker-copy"><span>Lineup in progress</span><h3>{theme.title}</h3><p>{theme.detail}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="signup-section content-width" id="register" aria-label="Register or apply to speak">
          <div className="registration-panel">
            <div className="panel-title"><span className="panel-icon"><UsersRound size={27} /></span><div><h2>Attend Connect 2026</h2><p>Be part of the conversation. It&apos;s free.</p></div></div>
            <form onSubmit={(event) => void submit(event, 'attend')}>
              <div className="form-grid">
                <label>Full name<input name="name" type="text" placeholder="Your name" maxLength={100} required /></label>
                <label>Email address<input name="email" type="email" placeholder="you@example.com" maxLength={254} required /></label>
                <label>Country<select name="countryCode" defaultValue="" required><option value="" disabled>Select your country</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
              </div>
              <label className="consent"><input name="consent" type="checkbox" required /> <span>I agree to receive updates about Connect 2026. <a href="https://www.dialectlibrary.com/privacy" target="_blank" rel="noreferrer">Privacy policy</a></span></label>
              <input className="honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
              <button className="button button-primary submit-button" type="submit" disabled={attendBusy || countries.length === 0}>{attendBusy ? 'Submitting…' : 'Reserve My Place'}</button>
              <p className="form-footnote">No cost. Event date and joining details will follow by email.</p>
              {attendStatus && <p className="form-status" role="status">{attendStatus}</p>}
            </form>
          </div>
          <div className="speaker-panel">
            <div className="speaker-panel-top"><span className="speaker-panel-icon"><Mic2 size={27} /></span><div><h2>Share Your Voice</h2><p>Give a short talk, demo, or share your contributor story.</p></div></div>
            <div className="speaker-options"><div><MonitorPlay /><span><strong>Talks</strong><small>Share your work and ideas</small></span></div><div><Sparkles /><span><strong>Demos</strong><small>Showcase projects and tools</small></span></div><div><UsersRound /><span><strong>Stories</strong><small>Real experiences. Real impact.</small></span></div></div>
            <button className="button speaker-apply" onClick={() => setSpeakerOpen(true)} type="button">Apply to Present <ArrowRight size={17} /></button>
            <small>All backgrounds and experience levels are welcome.</small>
          </div>
        </section>

        <section className="agenda-band" id="schedule"><div className="agenda-inner content-width"><div className="agenda-intro"><span className="section-kicker">Event agenda</span><h2>A day of ideas, voices and community</h2><p>October 2026 · Online. Exact date and times will be announced to registrants.</p></div><div className="agenda-steps">{agenda.map((item) => { const Icon = item.icon; return <div className="agenda-step" key={item.title}><span className="agenda-icon"><Icon size={21} /></span><span className="agenda-time">{item.time}</span><strong>{item.title}</strong><small>{item.detail}</small></div>; })}</div></div></section>

        <section className="faq-section content-width" id="faq"><div><span className="section-kicker">Frequently asked questions</span><h2>Good to know</h2><p>More details will be shared with everyone on the interest list.</p></div><div className="faq-list"><details><summary>Is the webinar free?</summary><p>Yes. There is no fee to join Dialect Library Connect 2026.</p></details><details><summary>When and where will it happen?</summary><p>The event is planned for October 2026 and will be held online. The exact date, time and joining link will be emailed after they are confirmed.</p></details><details><summary>Can I apply to speak?</summary><p>Yes. Tell us your topic and what you would like to share. Speaker applications are reviewed by the Dialect Library team; submitting one does not guarantee a speaking slot.</p></details><details><summary>Do I need a Dialect Library account?</summary><p>No account is required to indicate interest or apply to speak.</p></details></div></section>
      </main>

      <footer className="site-footer"><div className="content-width footer-inner"><Brand /><p>Different voices. A brighter tomorrow.</p><div><a href="https://www.dialectlibrary.com/privacy">Privacy</a><a href="https://www.dialectlibrary.com/terms">Terms</a><a href="mailto:hello@dialectlibrary.com">Contact</a></div></div></footer>

      {speakerOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSpeakerOpen(false); }}><div className="speaker-modal" role="dialog" aria-modal="true" aria-labelledby="speaker-modal-title"><div className="modal-head"><div><span className="section-kicker">Connect 2026</span><h2 id="speaker-modal-title">Apply to speak</h2><p>Tell us what you would like to bring to the conversation.</p></div><button type="button" aria-label="Close" onClick={() => setSpeakerOpen(false)}><X size={22} /></button></div><form onSubmit={(event) => void submit(event, 'speak')}><div className="modal-form-grid"><label>Full name<input name="name" type="text" required maxLength={100} placeholder="Your name" /></label><label>Email address<input name="email" type="email" required maxLength={254} placeholder="you@example.com" /></label></div><label>Country<select name="countryCode" defaultValue="" required><option value="" disabled>Select your country</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label><label>Proposed topic<input name="speakerTopic" type="text" required maxLength={120} placeholder="What would you speak about?" /></label><label>Short summary<textarea name="speakerSummary" required maxLength={1000} rows={4} placeholder="Tell us about your talk, demo, or contributor story." /></label><label className="consent"><input name="consent" type="checkbox" required /><span>I agree to receive updates about my application and Connect 2026. <a href="https://www.dialectlibrary.com/privacy" target="_blank" rel="noreferrer">Privacy policy</a></span></label><input className="honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" /><button className="button button-primary submit-button" type="submit" disabled={speakerBusy || countries.length === 0}>{speakerBusy ? 'Submitting…' : 'Submit application'}</button>{speakerStatus && <p className="form-status" role="status">{speakerStatus}</p>}</form></div></div>}
    </>
  );
}
