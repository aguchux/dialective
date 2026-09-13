import { Code2 } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function ApiPage() {
  return (
    <CataloguePageShell
      description="Generate keys, manage stream deck access, review endpoints, and monitor integrations."
      icon={<Code2 aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="API"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
