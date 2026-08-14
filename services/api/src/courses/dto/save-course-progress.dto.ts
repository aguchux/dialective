import { IsInt, Min } from 'class-validator';

export class SaveCourseProgressDto {
  @IsInt()
  @Min(0)
  lastSlideIndex!: number;

  @IsInt()
  @Min(1)
  totalSlides!: number;
}
