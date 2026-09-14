import { Settings } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { SettingsTabs } from '@/components/stream-catalogue/SettingsTabs';
import { BillingSettingsView } from '@/components/stream-catalogue/settings/BillingSettingsView';

export default function SettingsBillingPage() {
  return (
    <CataloguePageShell
      icon={<Settings aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Settings"
    >
      <SettingsTabs />
      <BillingSettingsView />
    </CataloguePageShell>
  );
}
