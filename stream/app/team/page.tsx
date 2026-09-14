import { UsersRound } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { TeamView } from '@/components/stream-catalogue/TeamView';

export default function TeamPage() {
  return (
    <CataloguePageShell
      description="Manage members, roles, and collaboration across your organization."
      icon={<UsersRound aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Team"
    >
      <TeamView />
    </CataloguePageShell>
  );
}
