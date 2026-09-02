export type TrainerRating = 'VERY_BAD' | 'BAD' | 'GOOD' | 'VERY_GOOD' | 'EXCELLENT';

const labels: Record<TrainerRating, string> = {
  VERY_BAD: 'Very bad',
  BAD: 'Bad',
  GOOD: 'Good',
  VERY_GOOD: 'Very good',
  EXCELLENT: 'Excellent',
};

const values: Record<TrainerRating, number> = {
  VERY_BAD: 1,
  BAD: 2,
  GOOD: 3,
  VERY_GOOD: 4,
  EXCELLENT: 5,
};

const styles: Record<TrainerRating, string> = {
  VERY_BAD: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  BAD: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  GOOD: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  VERY_GOOD: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  EXCELLENT: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
};

export const trainerRatingOptions: TrainerRating[] = [
  'VERY_BAD',
  'BAD',
  'GOOD',
  'VERY_GOOD',
  'EXCELLENT',
];

export function trainerRatingLabel(rating: TrainerRating): string {
  return labels[rating];
}

/** 1-5 star value -- mirrors trainerRatingValue in services/api/src/common/trainer-rating.util.ts. */
export function trainerRatingValue(rating: TrainerRating): number {
  return values[rating];
}

export function trainerRatingBadgeClass(rating: TrainerRating): string {
  return styles[rating];
}
