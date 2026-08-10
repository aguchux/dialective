import { landingStats } from './data';
import { formatCompactUsd } from '@/lib/format';

interface LandingStatsProps {
  dialectCount: number | null;
  countryCount: number | null;
  poolVolumeUsd: number | null;
  totalPayoutUsd: number | null;
}

export function LandingStats({ dialectCount, countryCount, poolVolumeUsd, totalPayoutUsd }: LandingStatsProps) {
  const stats = landingStats.map((stat) => {
    if (stat.label === 'Dialects' && dialectCount !== null) {
      return { ...stat, value: String(dialectCount) };
    }
    if (stat.label === 'Countries' && countryCount !== null) {
      return { ...stat, value: String(countryCount) };
    }
    if (stat.label === 'Pool Volume' && poolVolumeUsd !== null) {
      return { ...stat, value: formatCompactUsd(poolVolumeUsd) };
    }
    if (stat.label === 'Payout' && totalPayoutUsd !== null) {
      return { ...stat, value: formatCompactUsd(totalPayoutUsd) };
    }
    return stat;
  });

  return (
    <section className="mx-auto grid max-w-[820px] gap-3 py-4 md:grid-cols-4" aria-label="Dialect Library platform metrics">
      {stats.map((stat) => (
        <div
          className="rounded-lg border border-[rgba(5,5,5,0.1)] bg-white/75 p-4 text-center shadow-[0_14px_30px_rgba(12,20,20,0.08)] backdrop-blur-sm"
          key={stat.label}
        >
          <p className="text-2xl font-black leading-none md:text-3xl">{stat.value}</p>
          <p className="mt-1 font-extrabold">{stat.label}</p>
          <p className="mt-1 text-sm font-medium text-[rgba(5,5,5,0.62)]">{stat.detail}</p>
        </div>
      ))}
    </section>
  );
}
