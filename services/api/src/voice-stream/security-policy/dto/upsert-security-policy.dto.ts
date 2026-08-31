import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { SubscriberOrgRole } from '@dialectiva/db';

export class UpsertSecurityPolicyDto {
  @IsOptional()
  @IsBoolean()
  requireSso?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5) // floor of 5 minutes -- avoids a policy that effectively logs everyone out immediately
  refreshTokenTtlMinutes?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(SubscriberOrgRole, { each: true })
  minRoleForApiKeyCreation?: SubscriberOrgRole[];

  @IsOptional()
  @IsBoolean()
  requireIpAllowlist?: boolean;
}
