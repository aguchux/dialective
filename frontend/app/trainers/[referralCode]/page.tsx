import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, BarChart3, CalendarDays, Mic2, Quote, ShieldCheck } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { TrainerStarRating } from '@/components/ui/TrainerStarRating';
import { trainerRatingBadgeClass, trainerRatingLabel } from '@/lib/trainer-rating';
import { getPublicTrainerProfile } from '@/lib/trainer-profiles-api';

interface TrainerProfilePageProps {
  params: { referralCode: string };
}

function displayName(firstName: string | null, lastInitial: string | null) {
  if (!firstName && !lastInitial) return 'Dialect Library trainer';
  return [firstName, lastInitial].filter(Boolean).join(' ');
}

function locationLabel(profile: Awaited<ReturnType<typeof getPublicTrainerProfile>>) {
  if (!profile) return null;
  const dialect = [profile.dialectName, profile.dialectVariantName].filter(Boolean).join(' - ');
  return [dialect, profile.countryName].filter(Boolean).join(', ') || 'Dialect Library trainer';
}

export async function generateMetadata({ params }: TrainerProfilePageProps): Promise<Metadata> {
  const profile = await getPublicTrainerProfile(params.referralCode).catch(() => null);
  if (!profile) return { title: 'Trainer profile' };
  const name = displayName(profile.firstName, profile.lastInitial);
  return {
    title: `${name} | Trainer profile`,
    description: `View ${name}'s Dialect Library trainer profile, contribution record, and quality evidence.`,
  };
}

export default async function TrainerProfilePage({ params }: TrainerProfilePageProps) {
  const profile = await getPublicTrainerProfile(params.referralCode).catch(() => null);
  if (!profile) notFound();

  const name = displayName(profile.firstName, profile.lastInitial);
  const location = locationLabel(profile);
  const joined = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(
    new Date(profile.memberSince),
  );

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-ink">
      <ParallaxTopBackground />
      <LandingHeader />
      <div className="relative z-10 mx-auto grid max-w-6xl gap-8 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Trainers', href: '/testimonials' }, { label: name }]} />

        <section className="grid gap-6 rounded-xl border border-line bg-white/90 p-6 shadow-[0_10px_35px_rgba(27,31,27,0.08)] backdrop-blur md:grid-cols-[auto_1fr_auto] md:items-center md:p-8">
          <div
            className="grid size-20 place-items-center rounded-full bg-accent text-3xl font-black text-white"
            aria-hidden="true"
          >
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black leading-tight md:text-4xl">{name}</h1>
              {profile.identityVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                  <BadgeCheck className="size-4" aria-hidden="true" /> Identity verified
                </span>
              )}
              {profile.trainerRating && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${trainerRatingBadgeClass(profile.trainerRating)}`}
                >
                  {trainerRatingLabel(profile.trainerRating)} trainer
                  <TrainerStarRating rating={profile.trainerRating} size="sm" />
                </span>
              )}
            </div>
            <p className="text-lg text-muted">{location}</p>
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              <CalendarDays className="size-4" aria-hidden="true" /> Contributing since {joined}
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-3 text-sm font-extrabold text-white no-underline hover:bg-accent-dark"
            href={`/invite/${encodeURIComponent(profile.referralCode)}/earn`}
          >
            Join Dialect Library
          </Link>
        </section>

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Trainer contribution evidence">
          <MetricCard
            icon={Mic2}
            label="Scored contributions"
            value={String(profile.scoredContributions)}
          />
          <MetricCard
            icon={BarChart3}
            label="Average platform score"
            value={
              profile.averageScore === null ? 'In progress' : `${profile.averageScore.toFixed(1)}%`
            }
          />
          <MetricCard
            icon={ShieldCheck}
            label="Profile status"
            value={profile.identityVerified ? 'Verified trainer' : 'Active trainer'}
          />
        </section>

        <section className="grid gap-3 border-t border-line pt-8">
          <p className="text-sm font-extrabold uppercase text-accent">Contribution record</p>
          <h2 className="text-2xl font-black">A public view of trainer quality evidence.</h2>
          <p className="max-w-3xl leading-relaxed text-muted">
            This profile shows aggregate contribution and quality information only. Personal contact
            details, wallet activity, payment information, recordings, and individual task results
            remain private.
          </p>
        </section>

        {profile.testimonials.length > 0 && (
          <section
            className="grid gap-5 border-t border-line pt-8"
            aria-labelledby="trainer-testimonials-title"
          >
            <div>
              <p className="text-sm font-extrabold uppercase text-accent">Trainer testimonials</p>
              <h2 className="mt-1 text-2xl font-black" id="trainer-testimonials-title">
                What {profile.firstName ?? 'this trainer'} says
              </h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {profile.testimonials.map((testimony) => (
                <article
                  className="grid content-start gap-3 rounded-lg border border-line bg-white p-5"
                  key={testimony.id}
                >
                  {testimony.kind === 'VIDEO' && testimony.videoUrl ? (
                    <video
                      className="aspect-video w-full rounded-lg bg-black object-cover"
                      controls
                      preload="metadata"
                      src={testimony.videoUrl}
                    />
                  ) : (
                    <Quote className="size-7 text-accent" aria-hidden="true" />
                  )}
                  {testimony.text && (
                    <p className="leading-relaxed text-muted">&ldquo;{testimony.text}&rdquo;</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mic2;
  label: string;
  value: string;
}) {
  return (
    <article className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <Icon className="size-5 text-accent" aria-hidden="true" />
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="text-2xl font-black">{value}</p>
    </article>
  );
}
