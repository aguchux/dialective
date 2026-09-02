import { Star } from 'lucide-react';
import { trainerRatingLabel, trainerRatingValue, type TrainerRating } from '@/lib/trainer-rating';

const STAR_SIZE_CLASS: Record<'sm' | 'md', string> = {
  sm: 'size-3.5',
  md: 'size-4',
};

/** Fixed 5-star display mirroring a trainer's rating tier (VERY_BAD=1 star ... EXCELLENT=5 stars). Purely presentational -- see lib/trainer-rating.ts for the value mapping. */
export function TrainerStarRating({
  rating,
  size = 'md',
  className = '',
}: {
  rating: TrainerRating;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const filled = trainerRatingValue(rating);
  const starClass = STAR_SIZE_CLASS[size];
  return (
    <span
      aria-label={`${trainerRatingLabel(rating)} -- ${filled} out of 5 stars`}
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="img"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          aria-hidden="true"
          className={`${starClass} ${index < filled ? 'fill-amber-400 text-amber-400' : 'fill-none text-line'}`}
          key={index}
        />
      ))}
    </span>
  );
}
