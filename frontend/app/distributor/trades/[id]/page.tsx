'use client';

import { useParams } from 'next/navigation';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { TradeDetailView } from '@/components/p2p/TradeDetailView';

export default function DistributorTradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <DistributorShell>
      <TradeDetailView tradeId={id} />
    </DistributorShell>
  );
}
