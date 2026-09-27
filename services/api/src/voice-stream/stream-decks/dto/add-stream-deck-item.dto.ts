import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StreamRecordKind } from '@dialectiva/db';

export class AddStreamDeckItemDto {
  @IsString()
  recordingId!: string;

  /**
   * Which dataset the id belongs to.
   *
   * Optional and defaulting to WORD_RECORDING so existing API clients keep
   * working unchanged -- every recording that could be added before this
   * existed was a word recording, so the default is the historically correct
   * answer rather than a guess.
   *
   * It is a real discriminator, not a hint: the two tables have independent
   * uuid spaces, so a wrong kind means "not found" rather than silently
   * adding the wrong clip.
   */
  @IsOptional()
  @IsEnum(StreamRecordKind)
  recordKind?: StreamRecordKind;
}
