import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class ReviewTestimonyDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @ValidateIf((dto: ReviewTestimonyDto) => dto.status === 'REJECTED')
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
