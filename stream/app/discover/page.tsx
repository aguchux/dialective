import { Search } from 'lucide-react';
import { CataloguePageShell } from '@/components/stream-catalogue/CataloguePageShell';
import { PagePlaceholder } from '@/components/stream-catalogue/PagePlaceholder';

export default function DiscoverPage() {
  return (
    <CataloguePageShell
      description="Explore high-quality licensed voice and dialect datasets, browse by region and language, and find verified speakers."
      icon={<Search aria-hidden="true" className="size-[18px] sm:size-5" />}
      title="Discover Voice Collections"
    >
      <PagePlaceholder />
    </CataloguePageShell>
  );
}
