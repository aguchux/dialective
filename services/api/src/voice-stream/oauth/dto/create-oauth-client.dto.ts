import { ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { StreamKeyScope } from '@dialectiva/db';

export class CreateOAuthClientDto {
  @IsOptional()
  @IsString()
  deckId?: string; // omitted = org-wide client

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(StreamKeyScope, { each: true })
  scopes!: StreamKeyScope[];
}
