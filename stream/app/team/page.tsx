import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function TeamPage() {
  return (
    <CataloguePageShell
      description="Manage members, roles, access scopes, and collaboration across your organization."
      title="Team"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
