import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Covers both WordTrainingDirection submit shapes -- ENGLISH_TO_DIALECT and
 * DIALECT_TO_ENGLISH both require responseText+bucket+audioKey+durationMs+
 * noiseRating (DIALECT_TO_ENGLISH's audio is the trainer's own fresh
 * dialect redo recording of the source item -- see WordsService.
 * insertRedoRecording). WordsService.createRecording branches on the owned
 * assignment's direction to validate/score the response.
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
}
