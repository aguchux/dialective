'use client';

import { use } from 'react';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { TradeDetailView } from '@/components/p2p/TradeDetailView';

export default function DistributorTradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <DistributorShell>
      <TradeDetailView tradeId={id} />
    </DistributorShell>
  );
}
