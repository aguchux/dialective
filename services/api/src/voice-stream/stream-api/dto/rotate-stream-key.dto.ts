import { IsArray, IsIP, IsOptional } from 'class-validator';

/** Lets a caller supply an allowedIps override at rotation time -- e.g. to satisfy a newly-enabled requireIpAllowlist security policy on a key that predates it. Omitted = carry over the existing key's allowedIps unchanged. */
export class RotateStreamKeyDto {
  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  allowedIps?: string[];
}
