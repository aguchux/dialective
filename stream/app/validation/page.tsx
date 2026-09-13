import { ShieldCheck } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function ValidationPage() {
  return (
    <CataloguePageShell
      description="Review, score and verify voice recordings before adding them to Stream Decks."
      icon={<ShieldCheck aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Validation"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
