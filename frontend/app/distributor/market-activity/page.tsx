'use client';

import { DistributorShell } from '@/components/distributor/DistributorShell';
import { MarketActivity } from '@/components/p2p/MarketActivity';

export default function DistributorMarketActivityPage() {
  return (
    <DistributorShell>
      <MarketActivity />
    </DistributorShell>
  );
}
