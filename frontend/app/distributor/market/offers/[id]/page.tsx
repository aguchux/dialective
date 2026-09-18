'use client';

import { use } from 'react';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { OfferDetailView } from '@/components/p2p/OfferDetailView';

export default function DistributorOfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <DistributorShell>
      <OfferDetailView offerId={id} />
    </DistributorShell>
  );
}
