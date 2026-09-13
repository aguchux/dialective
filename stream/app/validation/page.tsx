import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function ValidationPage() {
  return (
    <CataloguePageShell
      description="Review, score and verify voice recordings before adding them to Stream Decks."
      title="Validation"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
