'use client';

import { DistributorShell } from '@/components/distributor/DistributorShell';
import { WhatsAppValidator } from '@/components/integrations/WhatsAppValidator';

export default function DistributorWhatsAppValidatorPage() {
  return (
    <DistributorShell>
      <WhatsAppValidator />
    </DistributorShell>
  );
}
