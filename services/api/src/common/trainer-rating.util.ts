import { TrainerRating } from '@dialectiva/db';

/** 1-5 star value backing both the admin badge and public star display -- mirrored in frontend/lib/trainer-rating.ts. */
export function trainerRatingValue(rating: TrainerRating | null): number | null {
  switch (rating) {
    case TrainerRating.VERY_BAD:
      return 1;
    case TrainerRating.BAD:
      return 2;
    case TrainerRating.GOOD:
      return 3;
    case TrainerRating.VERY_GOOD:
      return 4;
    case TrainerRating.EXCELLENT:
      return 5;
    default:
      return null;
  }
}
