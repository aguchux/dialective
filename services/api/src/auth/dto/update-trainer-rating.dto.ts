import { IsEnum } from 'class-validator';
import { TrainerRating } from '@dialectiva/db';

export class UpdateTrainerRatingDto {
  @IsEnum(TrainerRating)
  rating!: TrainerRating;
}
