import { IsString } from 'class-validator';

export class AddValidatorDeckItemDto {
  @IsString()
  recordingId!: string;
}
