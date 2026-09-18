'use client';

import { useParams } from 'next/navigation';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { OfferDetailView } from '@/components/p2p/OfferDetailView';

export default function DistributorOfferDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <DistributorShell>
      <OfferDetailView offerId={id} />
    </DistributorShell>
  );
}
