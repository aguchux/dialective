import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';
import { SettingsTabs } from '@/components/stream-catalogue/SettingsTabs';

export default function SettingsAdvancedPage() {
  return (
    <CataloguePageShell title="Settings">
      <SettingsTabs />
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
