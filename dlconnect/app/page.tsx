'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
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
  Info,
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

type Keynote = {
  name: string;
  role: string;
  topic: string;
  /** Optional headshot in /public/images. Falls back to the speaker's initials. */
  photo?: string;
};

/**
 * Confirmed keynote speakers, announced as they are booked.
 *
 * Empty until someone is actually confirmed: the section below falls back
 * to the themes above rather than inventing names or showing "TBA" cards.
 * A webinar landing page that lists placeholder people reads as padding
 * and, worse, invites a visitor to register on the strength of a lineup
 * that does not exist. Add an entry here the day a speaker signs on.
 */
const keynotes: Keynote[] = [];

type RegistrationResult = {
  interest: Interest;
  alreadyRegistered: boolean;
  /** An existing attendee just added a speaker application. */
  addedSpeakerApplication: boolean;
  registeredAt: string | null;
};

type MemberMatch = {
  found: true;
  firstName: string | null;
  lastName: string | null;
  email: string;
  country: string | null;
  dialect: string | null;
};

/**
 * Asks whether the typed email belongs to a Dialect Library member.
 *
 * Returns null on any failure: a lookup is an enhancement, and a visitor
 * must never be blocked from registering because this call fell over.
 */
async function lookupMember(email: string): Promise<MemberMatch | null> {
  try {
    const response = await fetch('/api/connect', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as MemberMatch | { found: false };
    return data.found ? data : null;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

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

/**
 * The attend/reserve form. One implementation, rendered both in the page
 * panel and inside the header CTA's dialog -- the two entry points the
 * visitor chooses between must behave identically, so they share this
 * rather than duplicating the fields and the member-match logic.
 */
function AttendForm({
  countries,
  onSubmit,
  busy,
  status,
  submitLabel,
}: {
  countries: Country[];
  onSubmit: (event: FormEvent<HTMLFormElement>, confirmedMember: boolean) => void | Promise<void>;
  busy: boolean;
  status: string;
  submitLabel: string;
}) {
  const [match, setMatch] = useState<MemberMatch | null>(null);
  const [checking, setChecking] = useState(false);
  // null = not answered yet. The form stays submittable either way; this
  // only decides whether the registration gets linked to the account.
  const [isMe, setIsMe] = useState<boolean | null>(null);

  async function checkEmail(email: string) {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setMatch(null);
      setIsMe(null);
      return;
    }
    setChecking(true);
    const found = await lookupMember(trimmed);
    setChecking(false);
    setMatch(found);
    setIsMe(null);
  }

  return (
    <form
      onSubmit={(event) => {
        void onSubmit(event, isMe === true);
      }}
    >
      <div className="form-grid">
        <label>Full name<input name="name" type="text" placeholder="Your name" maxLength={100} required /></label>
        <label>
          Email address
          <input
            name="email"
            type="email"
            placeholder="you@example.com"
            maxLength={254}
            required
            // On blur, not on every keystroke: a lookup per character
            // would both hammer the rate limit and fire on half-typed
            // addresses that can never match.
            onBlur={(event) => void checkEmail(event.target.value)}
          />
        </label>
        <label>Country<select name="countryCode" defaultValue="" required><option value="" disabled>Select your country</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
      </div>

      {checking && <p className="member-checking">Checking your details…</p>}

      {match && isMe !== false && (
        <div className="member-match" role="status">
          <div className="member-match-head">
            <ShieldCheck size={18} />
            <strong>Looks like you already have a Dialect Library account</strong>
          </div>
          <p className="member-match-body">
            {[match.firstName, match.lastName].filter(Boolean).join(' ')} · {match.email}
            {match.country ? ` · ${match.country}` : ''}
            {match.dialect ? ` · ${match.dialect}` : ''}
          </p>
          <p className="member-match-note">
            Confirm and we will send your event reminders to the email and phone number you already
            verified with us.
          </p>
          <div className="member-match-actions">
            <button
              className={isMe === true ? 'chip chip-active' : 'chip'}
              onClick={() => setIsMe(true)}
              type="button"
              aria-pressed={isMe === true}
            >
              Yes, that&apos;s me
            </button>
            <button className="chip" onClick={() => setIsMe(false)} type="button">
              Not me
            </button>
          </div>
        </div>
      )}

      <label className="consent"><input name="consent" type="checkbox" required /> <span>I agree to receive updates about Connect 2026. <a href="https://www.dialectlibrary.com/privacy" target="_blank" rel="noreferrer">Privacy policy</a></span></label>
      <input className="honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button className="button button-primary submit-button" type="submit" disabled={busy || countries.length === 0}>
        {busy ? 'Submitting…' : isMe === true ? 'Confirm Reservation' : submitLabel}
      </button>
      <p className="form-footnote">No cost. Event date and joining details will follow by email.</p>
      {status && <p className="form-status" role="status">{status}</p>}
    </form>
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
  const [attendOpen, setAttendOpen] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);
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
    if (!speakerOpen && !attendOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSpeakerOpen(false);
      setAttendOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [speakerOpen, attendOpen]);

  function navigateSlide(direction: -1 | 1) {
    setSlide((current) => (current + direction + slides.length) % slides.length);
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
    interest: Interest,
    confirmedMember = false,
  ) {
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
          confirmedMember,
          website: String(formData.get('website') ?? ''),
          ...(interest === 'speak'
            ? {
                speakerTopic: String(formData.get('speakerTopic') ?? ''),
                speakerSummary: String(formData.get('speakerSummary') ?? ''),
              }
            : {}),
        }),
      });
      const data = (await response.json()) as {
        message?: string | string[];
        alreadyRegistered?: boolean;
        addedSpeakerApplication?: boolean;
        registeredAt?: string | null;
      };
      if (!response.ok) throw new Error(errorMessage(data));
      form.reset();
      // The outcome is a dialog, not a line of text under the button --
      // a reservation is the thing the visitor came to do, and it should
      // land as clearly as it matters.
      setResult({
        interest,
        alreadyRegistered: !!data.alreadyRegistered,
        addedSpeakerApplication: !!data.addedSpeakerApplication,
        registeredAt: data.registeredAt ?? null,
      });
      setAttendOpen(false);
      setSpeakerOpen(false);
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
            <button className="button button-primary" onClick={() => setAttendOpen(true)} type="button">
              Register Free
            </button>
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
          <div className="section-topline"><span className="section-kicker">{keynotes.length > 0 ? 'Keynote speakers' : 'Featured speakers'}</span><span className="line" /></div>
          <div className="section-heading"><div><h2>Meet the voices of Connect</h2><p>{keynotes.length > 0 ? 'Leading the conversation at Connect 2026.' : 'Contributors, researchers, and community builders will lead the conversation.'}</p></div><button className="text-link" onClick={() => setSpeakerOpen(true)} type="button">Apply to join the lineup <ArrowRight size={16} /></button></div>
          {keynotes.length > 0 ? (
            <div className="keynote-grid">
              {keynotes.map((person) => (
                <article className="keynote-card" key={person.name}>
                  {person.photo ? (
                    <div className="keynote-photo" style={{ backgroundImage: `url(${person.photo})` }} aria-hidden="true" />
                  ) : (
                    <div className="keynote-photo keynote-initials" aria-hidden="true">{initials(person.name)}</div>
                  )}
                  <div className="keynote-copy">
                    <h3>{person.name}</h3>
                    <span className="keynote-role">{person.role}</span>
                    <p>{person.topic}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            // No confirmed lineup yet. These are the themes the event will
            // cover, labelled as such -- not speaker cards with invented
            // names, and not empty "TBA" slots.
            <div className="speaker-grid">
              {speakerThemes.map((theme) => (
                <article className="speaker-card" key={theme.title}>
                  <div className="speaker-portrait" style={{ backgroundPosition: theme.position }} aria-hidden="true" />
                  <div className="speaker-copy"><span>Lineup in progress</span><h3>{theme.title}</h3><p>{theme.detail}</p></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="signup-section content-width" id="register" aria-label="Register or apply to speak">
          <div className="registration-panel">
            <div className="panel-title"><span className="panel-icon"><UsersRound size={27} /></span><div><h2>Attend Connect 2026</h2><p>Be part of the conversation. It&apos;s free.</p></div></div>
            <AttendForm
              busy={attendBusy}
              countries={countries}
              onSubmit={(event, confirmedMember) => submit(event, 'attend', confirmedMember)}
              status={attendStatus}
              submitLabel="Reserve My Place"
            />
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

      {result && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setResult(null);
          }}
        >
          <div className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <div
              className={
                result.alreadyRegistered && !result.addedSpeakerApplication
                  ? 'result-icon result-icon-info'
                  : 'result-icon'
              }
            >
              {result.alreadyRegistered && !result.addedSpeakerApplication ? (
                <Info size={38} />
              ) : (
                <BadgeCheck size={38} />
              )}
            </div>
            <h2 id="result-title">
              {result.addedSpeakerApplication
                ? 'Application received'
                : result.alreadyRegistered
                  ? "You're already registered"
                  : result.interest === 'speak'
                    ? 'Application received'
                    : 'Your place is reserved'}
            </h2>
            <p className="result-body">
              {result.addedSpeakerApplication ? (
                'Thank you. We have your speaker application, and your place as an attendee is unchanged. Our team reviews every submission and will contact you by email.'
              ) : result.alreadyRegistered ? (
                <>
                  This email is already on the list for Connect 2026
                  {result.registeredAt
                    ? ` — you registered on ${new Date(result.registeredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`
                    : ''}
                  . We have not created a second reservation, and your details are up to date.
                </>
              ) : result.interest === 'speak' ? (
                'Thank you. Our team reviews every speaker application and will contact you by email about yours.'
              ) : (
                'Thank you for joining us. A confirmation email is on its way.'
              )}
            </p>
            <div className="result-meta">
              <CalendarCheck size={17} />
              <span>October 2026 · Online · We will email the date, time and joining link once confirmed.</span>
            </div>
            <button className="button button-primary" onClick={() => setResult(null)} type="button">
              Done
            </button>
          </div>
        </div>
      )}

      {attendOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAttendOpen(false);
          }}
        >
          <div className="speaker-modal" role="dialog" aria-modal="true" aria-labelledby="attend-modal-title">
            <div className="modal-head">
              <div>
                <span className="section-kicker">Connect 2026</span>
                <h2 id="attend-modal-title">Reserve your place</h2>
                <p>Free to attend. October 2026, online.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setAttendOpen(false)}>
                <X size={22} />
              </button>
            </div>
            {/* Same component as the in-page panel -- the header CTA and
                the section form are two doors into one behaviour, not two
                implementations that can drift apart. */}
            <AttendForm
              busy={attendBusy}
              countries={countries}
              onSubmit={(event, confirmedMember) => submit(event, 'attend', confirmedMember)}
              status={attendStatus}
              submitLabel="Reserve My Place"
            />
          </div>
        </div>
      )}

      {speakerOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSpeakerOpen(false); }}><div className="speaker-modal" role="dialog" aria-modal="true" aria-labelledby="speaker-modal-title"><div className="modal-head"><div><span className="section-kicker">Connect 2026</span><h2 id="speaker-modal-title">Apply to speak</h2><p>Tell us what you would like to bring to the conversation.</p></div><button type="button" aria-label="Close" onClick={() => setSpeakerOpen(false)}><X size={22} /></button></div><form onSubmit={(event) => void submit(event, 'speak')}><div className="modal-form-grid"><label>Full name<input name="name" type="text" required maxLength={100} placeholder="Your name" /></label><label>Email address<input name="email" type="email" required maxLength={254} placeholder="you@example.com" /></label></div><label>Country<select name="countryCode" defaultValue="" required><option value="" disabled>Select your country</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label><label>Proposed topic<input name="speakerTopic" type="text" required maxLength={120} placeholder="What would you speak about?" /></label><label>Short summary<textarea name="speakerSummary" required maxLength={1000} rows={4} placeholder="Tell us about your talk, demo, or contributor story." /></label><label className="consent"><input name="consent" type="checkbox" required /><span>I agree to receive updates about my application and Connect 2026. <a href="https://www.dialectlibrary.com/privacy" target="_blank" rel="noreferrer">Privacy policy</a></span></label><input className="honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" /><button className="button button-primary submit-button" type="submit" disabled={speakerBusy || countries.length === 0}>{speakerBusy ? 'Submitting…' : 'Submit application'}</button>{speakerStatus && <p className="form-status" role="status">{speakerStatus}</p>}</form></div></div>}
    </>
  );
}
