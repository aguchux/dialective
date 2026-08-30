import { ContributorRail } from './ContributorRail';
import { CountryFlagMarquee } from './CountryFlagMarquee';
import { HowItWorks } from './HowItWorks';
import { LandingTestimonial, TestimonialsCarousel } from './TestimonialsCarousel';
import { LandingBlog } from './LandingBlog';
import { LandingFooter } from './LandingFooter';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { LandingStats } from './LandingStats';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

interface GeoStatsVisibility {
  countries: boolean;
  dialects: boolean;
  trainers: boolean;
  totalRecordings: boolean;
  payout: boolean;
}

interface GeoStats {
  countryCount: number;
  dialectCount: number;
  totalTrainers: number;
  totalRecordings: number;
  totalPayoutUsd: number;
  visibility: GeoStatsVisibility;
}

const DEFAULT_VISIBILITY: GeoStatsVisibility = {
  countries: true,
  dialects: true,
  trainers: true,
  totalRecordings: true,
  payout: true,
};

interface Country {
  id: string;
  code: string;
  name: string;
  _count?: { dialects: number };
}

async function getGeoStats(): Promise<GeoStats | null> {
  try {
    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/geo/stats`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getCountries(): Promise<Country[]> {
  try {
    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/geo/countries`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function getTestimonials(): Promise<LandingTestimonial[]> {
  try {
    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/testimonials/public`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function LandingPage() {
  const [geoStats, countries, testimonials] = await Promise.all([
    getGeoStats(),
    getCountries(),
    getTestimonials(),
  ]);
  const dialectCount = geoStats?.dialectCount ?? null;
  const countryCount = geoStats?.countryCount ?? null;
  const totalTrainers = geoStats?.totalTrainers ?? null;
  const totalRecordings = geoStats?.totalRecordings ?? null;
  const totalPayoutUsd = geoStats?.totalPayoutUsd ?? null;
  const visibility = geoStats?.visibility ?? DEFAULT_VISIBILITY;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-white text-[#050505]">
      <LandingHeader />
      <div className="relative isolate overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[#c9eff7] bg-cover bg-top bg-no-repeat"
          style={{ backgroundImage: "url('/landing-hero.png')" }}
          aria-hidden="true"
        />
        <div className="px-4 md:px-[3.4rem]">
          <LandingHero />
          <LandingStats
            dialectCount={dialectCount}
            countryCount={countryCount}
            totalRecordings={totalRecordings}
            totalTrainers={totalTrainers}
            totalPayoutUsd={totalPayoutUsd}
            visibility={visibility}
          />
        </div>
      </div>
      <div className="px-4 md:px-[3.4rem]">
        <ContributorRail dialectCount={dialectCount} />
        <TestimonialsCarousel testimonials={testimonials} />
        <HowItWorks />
        <CountryFlagMarquee countries={countries} />
        <LandingBlog />
      </div>
      <LandingFooter />
    </main>
  );
}
