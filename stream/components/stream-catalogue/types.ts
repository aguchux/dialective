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
