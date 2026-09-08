import { IsString, MaxLength } from 'class-validator';

export class UpdateValidatorTranscriptDto {
  @IsString()
  @MaxLength(10000)
  transcript!: string;
}
