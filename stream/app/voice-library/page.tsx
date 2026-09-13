import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function VoiceLibraryPage() {
  return (
    <CataloguePageShell
      description="Browse and manage licensed voice recordings and verified dialect samples."
      title="Voice Library"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
