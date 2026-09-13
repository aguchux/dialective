import { Layers3 } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function StreamDecksPage() {
  return (
    <CataloguePageShell
      description="Create, organize and stream curated voice datasets for your models."
      icon={<Layers3 aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Stream Decks"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
