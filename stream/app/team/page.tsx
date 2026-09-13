import { UsersRound } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function TeamPage() {
  return (
    <CataloguePageShell
      description="Manage members, roles, access scopes, and collaboration across your organization."
      icon={<UsersRound aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Team"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
