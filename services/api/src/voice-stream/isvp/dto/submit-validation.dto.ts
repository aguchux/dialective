import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SubmitValidationDto {
  @IsInt()
  @Min(0)
  @Max(100)
  transcriptAccuracy!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  pronunciationAccuracy!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  dialectAuthenticity!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  speechClarity!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  audioQuality!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  overallScore!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
