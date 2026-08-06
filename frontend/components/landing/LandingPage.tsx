import { ContributorRail } from './ContributorRail';
import { HowItWorks } from './HowItWorks';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { LandingFooter } from './LandingFooter';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { LandingStats } from './LandingStats';

export function LandingPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground className="min-h-166.75" />

      <div className="relative z-10">
        <LandingHeader />
        <div className="px-4 md:px-[3.4rem]">
          <LandingHero />
          <LandingStats />
          <ContributorRail />
          <HowItWorks />
        </div>
        <LandingFooter />
      </div>
    </main>
  );
}
