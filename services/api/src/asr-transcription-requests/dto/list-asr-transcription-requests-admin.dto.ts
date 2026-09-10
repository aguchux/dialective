import { IsEnum, IsOptional } from 'class-validator';
import { AsrTranscriptionRequestStatus } from '@dialectiva/db';

export class ListAsrTranscriptionRequestsAdminDto {
  @IsOptional()
  @IsEnum(AsrTranscriptionRequestStatus)
  status?: AsrTranscriptionRequestStatus;
}
