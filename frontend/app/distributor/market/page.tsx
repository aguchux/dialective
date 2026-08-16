'use client';

import { DistributorShell } from '@/components/distributor/DistributorShell';
import { MarketView } from '@/components/p2p/MarketView';

export default function DistributorMarketPage() {
  return (
    <DistributorShell>
      <div className="grid gap-6">
        <div className="grid gap-1">
          <h1 className="text-3xl font-black">P2P Market</h1>
          <p className="text-muted">Buy and sell DL tokens directly with other members.</p>
        </div>

        <section className="rounded-lg border border-line bg-surface p-3 text-ink">
          <MarketView />
        </section>
      </div>
    </DistributorShell>
  );
}
