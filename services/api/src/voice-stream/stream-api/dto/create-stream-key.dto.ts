import { ArrayNotEmpty, IsArray, IsDateString, IsEnum, IsIP, IsOptional, IsString } from 'class-validator';
import { StreamKeyScope } from '@dialectiva/db';

export class CreateStreamKeyDto {
  @IsOptional()
  @IsString()
  deckId?: string; // omitted = org-wide key (doc section 26.2)

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(StreamKeyScope, { each: true })
  scopes!: StreamKeyScope[];

  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  allowedIps?: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
