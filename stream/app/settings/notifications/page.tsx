import { Settings } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';
import { SettingsTabs } from '@/components/stream-catalogue/SettingsTabs';

export default function SettingsNotificationsPage() {
  return (
    <CataloguePageShell
      icon={<Settings aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Settings"
    >
      <SettingsTabs />
      <PagePlaceholder note="Notification preferences aren't available yet -- this section will let you control email and SMS alerts once that's built." />
    </CataloguePageShell>
  );
}
