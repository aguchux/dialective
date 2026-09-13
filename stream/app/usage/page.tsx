import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function UsagePage() {
  return (
    <CataloguePageShell
      description="Monitor API consumption, stream hours, deck activity, and billing usage across your organization."
      title="Usage"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
