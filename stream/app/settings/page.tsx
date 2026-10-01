import { UserRound } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { SettingsTabs } from '@/components/stream-catalogue/SettingsTabs';
import { GeneralSettingsView } from '@/components/stream-catalogue/settings/GeneralSettingsView';

export default function SettingsProfilePage() {
  return (
    <CataloguePageShell
      icon={<UserRound aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Profile"
    >
      <SettingsTabs />
      <GeneralSettingsView />
    </CataloguePageShell>
  );
}
