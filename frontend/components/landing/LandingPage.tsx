import { ContributorRail } from './ContributorRail';
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

async function getDialectCount(): Promise<number | null> {
  try {
    const res = await fetch(`${PUBLIC_API_V1_BASE_URL}/geo/stats`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const stats: GeoStats = await res.json();
    return stats.dialectCount;
  } catch {
    return null;
  }
}

export async function LandingPage() {
  const dialectCount = await getDialectCount();

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground className="min-h-166.75" />

      <div className="relative z-10">
        <LandingHeader />
        <div className="px-4 md:px-[3.4rem]">
          <LandingHero />
          <LandingStats dialectCount={dialectCount} />
          <ContributorRail dialectCount={dialectCount} />
          <HowItWorks />
        </div>
        <LandingFooter />
      </div>
    </main>
  );
}
