import { ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60000)
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
