import { Settings } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { SettingsTabs } from '@/components/stream-catalogue/SettingsTabs';
import { SecuritySettingsView } from '@/components/stream-catalogue/settings/SecuritySettingsView';

export default function SettingsSecurityPage() {
  return (
    <CataloguePageShell
      icon={<Settings aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Settings"
    >
      <SettingsTabs />
      <SecuritySettingsView />
    </CataloguePageShell>
  );
}
