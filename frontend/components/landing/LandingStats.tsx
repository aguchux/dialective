import { landingStats } from './data';
import { formatCompactUsd } from '@/lib/format';

interface StatsVisibility {
  countries: boolean;
  dialects: boolean;
  trainers: boolean;
  poolVolume: boolean;
  payout: boolean;
}

interface LandingStatsProps {
  dialectCount: number | null;
  countryCount: number | null;
  poolVolumeUsd: number | null;
  totalTrainers: number | null;
  totalPayoutUsd: number | null;
  visibility: StatsVisibility;
}

const VISIBILITY_KEY_BY_LABEL: Record<string, keyof StatsVisibility> = {
  Dialects: 'dialects',
  Countries: 'countries',
  'Pool Volume': 'poolVolume',
  Trainers: 'trainers',
  Payout: 'payout',
};

export function LandingStats({ dialectCount, countryCount, poolVolumeUsd, totalTrainers, totalPayoutUsd, visibility }: LandingStatsProps) {
  const stats = landingStats
    .filter((stat) => visibility[VISIBILITY_KEY_BY_LABEL[stat.label]] ?? true)
    .map((stat) => {
      if (stat.label === 'Dialects' && dialectCount !== null) {
        return { ...stat, value: String(dialectCount) };
      }
      if (stat.label === 'Countries' && countryCount !== null) {
        return { ...stat, value: String(countryCount) };
      }
      if (stat.label === 'Pool Volume' && poolVolumeUsd !== null) {
        return { ...stat, value: formatCompactUsd(poolVolumeUsd) };
      }
      if (stat.label === 'Trainers' && totalTrainers !== null) {
        return { ...stat, value: String(totalTrainers) };
      }
      if (stat.label === 'Payout' && totalPayoutUsd !== null) {
        return { ...stat, value: formatCompactUsd(totalPayoutUsd) };
      }
      return stat;
    });

  if (stats.length === 0) return null;

  return (
    <section className="mx-auto grid max-w-[980px] gap-3 py-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Dialect Library platform metrics">
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
