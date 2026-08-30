import { IsString } from 'class-validator';

export class AddStreamDeckItemDto {
  @IsString()
  recordingId!: string;
}
