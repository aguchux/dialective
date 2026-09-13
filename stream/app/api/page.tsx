import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function ApiPage() {
  return (
    <CataloguePageShell
      description="Generate keys, manage stream deck access, review endpoints, and monitor integrations."
      title="API"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
