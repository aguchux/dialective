import { Type } from 'class-transformer';
import { CommunityRole, CommunityUserStatus } from '@dialectiva/db';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCommunityMembersAdminDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CommunityUserStatus)
  status?: CommunityUserStatus;

  @IsOptional()
  @IsEnum(CommunityRole)
  role?: CommunityRole;
}
