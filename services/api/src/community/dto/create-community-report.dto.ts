import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CommunityReportReason, CommunityReportTargetType } from '@dialectiva/db';

export class CreateCommunityReportDto {
  @IsEnum(CommunityReportTargetType)
  targetType!: CommunityReportTargetType;

  @IsString()
  targetId!: string;

  @IsEnum(CommunityReportReason)
  reason!: CommunityReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
