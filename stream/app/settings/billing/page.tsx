import { Settings } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';
import { SettingsTabs } from '@/components/stream-catalogue/SettingsTabs';

export default function SettingsBillingPage() {
  return (
    <CataloguePageShell
      icon={<Settings aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Settings"
    >
      <SettingsTabs />
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
