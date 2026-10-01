export type FilterKey = 'country' | 'dialect' | 'subdialect' | 'quality' | 'license';
export type CollectionStatus = 'verified' | 'licensed';
export type PlaybackState = 'playing' | 'paused';

export interface PreviewSample {
  title: string;
  durationSeconds: number;
  waveform: number[];
}

export interface CatalogueCollection {
  id: string;
  title: string;
  subtitle: string;
  language: string;
  country: string;
  dialect: string;
  subdialect: string;
  hours: number;
  speakers: number;
  qualityScore: number;
  recordingQuality: string;
  license: string;
  lastUpdated: string;
  description: string;
  coverUrl: string;
  coverAlt: string;
  status: CollectionStatus;
  preview: PreviewSample;
}

export interface StreamDeck {
  id: string;
  title: string;
  dialect: string;
  country: string;
  durationSeconds: number;
  coverUrl: string;
  coverAlt: string;
  waveform: number[];
}

export interface VerifiedSpeaker {
  id: string;
  name: string;
  language: string;
  country: string;
  hours: number;
  score: number;
  avatarUrl: string;
  avatarAlt: string;
}

export interface CatalogueMetric {
  label: string;
  value: string;
  delta: string;
  trend: number[];
}

export interface CatalogueFilters {
  country: string | null;
  dialect: string | null;
  subdialect: string | null;
  quality: string | null;
  license: string | null;
}

export interface PinnedCollection {
  id: string;
  title: string;
  meta: string;
  coverUrl: string;
  coverAlt: string;
}

export interface ValidationBreakdown {
  label: string;
  score: number;
}

export interface CatalogueShowcase {
  collections: CatalogueCollection[];
  streamDecks: StreamDeck[];
  verifiedSpeakers: VerifiedSpeaker[];
  catalogueMetrics: CatalogueMetric[];
  pinnedCollections: PinnedCollection[];
  filterOptions: Record<FilterKey, string[]>;
  validationBreakdown: ValidationBreakdown[];
}

/**
 * Geo reference data behind the catalogue filters, straight from the
 * Country/Dialect/DialectVariant tables via the API's GeoController.
 *
 * The filter dropdowns used to be built from whatever collections the
 * showcase returned, so they listed only values already present in the
 * loaded results -- and that showcase is still mock data, so the options
 * were effectively fictional. Reading the real tables means a country with
 * no recordings yet is still selectable, which is the honest answer to
 * "what can I filter by".
 */
export interface GeoCountry {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
  _count?: { dialects: number };
}

export interface GeoDialect {
  id: string;
  tag: string;
  name: string;
}

export interface GeoDialectVariant {
  id: string;
  tag: string;
  name: string;
}
