import { Settings } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { SettingsTabs } from '@/components/stream-catalogue/SettingsTabs';
import { IntegrationsSettingsView } from '@/components/stream-catalogue/settings/IntegrationsSettingsView';

export default function SettingsIntegrationsPage() {
  return (
    <CataloguePageShell
      icon={<Settings aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Settings"
    >
      <SettingsTabs />
      <IntegrationsSettingsView />
    </CataloguePageShell>
  );
}
