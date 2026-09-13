import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function StreamDecksPage() {
  return (
    <CataloguePageShell
      description="Create, organize and stream curated voice datasets for your models."
      title="Stream Decks"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
