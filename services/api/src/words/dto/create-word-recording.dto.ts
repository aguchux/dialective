import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Covers all three WordTrainingDirection submit shapes -- ENGLISH_TO_DIALECT/
 * DIALECT_TO_ENGLISH require responseText+bucket+audioKey+durationMs+
 * noiseRating; SENTENCE_REBUILD requires only submittedOrder, no audio.
 * WordsService.createRecording branches on the owned assignment's
 * direction and validates the direction-appropriate fields are present --
 * kept as one DTO/one POST /words/recordings endpoint rather than a
 * second route, since the assignment (not client-declared intent)
 * determines which shape is expected.
 */
export class CreateWordRecordingDto {
  @IsString()
  @IsNotEmpty()
  assignmentId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  responseText?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bucket?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  audioKey?: string;

  // Static upper bound only -- the real, admin-configurable ceiling is
  // wordTrainingRecordingMaxTimeoutSeconds (see PlatformSettingsService),
  // enforced dynamically in WordsService.createRecording since a
  // class-validator decorator can't read DB-backed settings. This just
  // needs to be >= the highest that setting is allowed to go
  // (UpdatePlatformSettingsDto caps it at 1800s) plus a grace margin.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_900_000)
  durationMs?: number;

  @IsOptional()
  @IsIn(['NOISY', 'FAIR', 'QUIET'])
  noiseRating?: 'NOISY' | 'FAIR' | 'QUIET';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @IsInt({ each: true })
  submittedOrder?: number[];
}
