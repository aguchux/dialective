import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListPeerReviewQueueDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export class SubmitPeerReviewDto {
  @IsIn(['APPROVE', 'DECLINE'])
  verdict!: 'APPROVE' | 'DECLINE';

  /**
   * The number the reviewer reads off the card. Hashed before storage --
   * the platform keeps no second plaintext copy of an ID number, it only
   * needs to know whether the reviewer read the same one that is on file.
   *
   * Optional: some accepted documents carry no number. Omitting it records
   * that there was nothing to compare, which is better evidence than a
   * reviewer inventing a value to get past a required field.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  declineReason?: string;
}
