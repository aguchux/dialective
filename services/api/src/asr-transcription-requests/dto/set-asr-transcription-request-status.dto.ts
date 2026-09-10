import { IsEnum } from 'class-validator';
import { AsrTranscriptionRequestStatus } from '@dialectiva/db';

export class SetAsrTranscriptionRequestStatusDto {
  @IsEnum(AsrTranscriptionRequestStatus)
  status!: AsrTranscriptionRequestStatus;
}
