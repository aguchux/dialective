'use client';

import { DistributorShell } from '@/components/distributor/DistributorShell';
import { IdReview } from '@/components/integrations/IdReview';

export default function DistributorIdReviewPage() {
  return (
    <DistributorShell>
      <IdReview />
    </DistributorShell>
  );
}
