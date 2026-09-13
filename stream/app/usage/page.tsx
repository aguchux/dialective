import { BarChart3 } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function UsagePage() {
  return (
    <CataloguePageShell
      description="Monitor API consumption, stream hours, deck activity, and billing usage across your organization."
      icon={<BarChart3 aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Usage"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
