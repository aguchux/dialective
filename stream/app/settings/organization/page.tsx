import { Settings } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { SettingsTabs } from '@/components/stream-catalogue/SettingsTabs';
import { OrganizationSettingsView } from '@/components/stream-catalogue/settings/OrganizationSettingsView';

export default function SettingsOrganizationPage() {
  return (
    <CataloguePageShell
      icon={<Settings aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Settings"
    >
      <SettingsTabs />
      <OrganizationSettingsView />
    </CataloguePageShell>
  );
}
