import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateCommunitySettingsDto {
  @IsOptional()
  @IsBoolean()
  postingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  repliesEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  attachmentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  reactionsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080) // 1 week
  newMemberPostingDelayMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requireApprovalForNewMembers?: boolean;

  @IsOptional()
  @IsBoolean()
  adsterraEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  adsterraSiteId?: string | null;

  @IsOptional()
  @IsBoolean()
  monetagEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  monetagZoneId?: string | null;
}
