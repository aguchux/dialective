import { ContributorRail } from './ContributorRail';
import { CountryFlagMarquee } from './CountryFlagMarquee';
import { HowItWorks } from './HowItWorks';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { LandingFooter } from './LandingFooter';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { LandingStats } from './LandingStats';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';

interface GeoStats {
  countryCount: number;
  dialectCount: number;
}

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
    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/geo/countries`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function LandingPage() {
  const [geoStats, countries] = await Promise.all([getGeoStats(), getCountries()]);
  const dialectCount = geoStats?.dialectCount ?? null;
  const countryCount = geoStats?.countryCount ?? null;

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground className="min-h-166.75" />

      <div className="relative z-10">
        <LandingHeader />
        <div className="px-4 md:px-[3.4rem]">
          <LandingHero />
          <LandingStats dialectCount={dialectCount} countryCount={countryCount} />
          <ContributorRail dialectCount={dialectCount} />
          <HowItWorks />
          <CountryFlagMarquee countries={countries} />
        </div>
        <LandingFooter />
      </div>
    </main>
  );
}
