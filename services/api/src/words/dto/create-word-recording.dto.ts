import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateWordRecordingDto {
  @IsString()
  @IsNotEmpty()
  assignmentId!: string;

  @IsString()
  @IsNotEmpty()
  responseText!: string;

  @IsString()
  @IsNotEmpty()
  bucket!: string;

  @IsString()
  @IsNotEmpty()
  audioKey!: string;

  @IsInt()
  @Min(1)
  @Max(60000)
  durationMs!: number;

  @IsIn(['NOISY', 'FAIR', 'QUIET'])
  noiseRating!: 'NOISY' | 'FAIR' | 'QUIET';
}
