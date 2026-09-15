'use client';

import { DistributorShell } from '@/components/distributor/DistributorShell';
import { IntegrationsMarketplace } from '@/components/integrations/IntegrationsMarketplace';

export default function DistributorIntegrationsPage() {
  return (
    <DistributorShell>
      <IntegrationsMarketplace />
    </DistributorShell>
  );
}
