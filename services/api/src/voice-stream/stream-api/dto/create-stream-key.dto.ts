import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsIP,
  IsOptional,
  IsString,
} from 'class-validator';
import { StreamKeyScope, VdclPurpose } from '@dialectiva/db';

export class CreateStreamKeyDto {
  @IsOptional()
  @IsString()
  deckId?: string; // omitted = org-wide key (doc section 26.2)

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(StreamKeyScope, { each: true })
  scopes!: StreamKeyScope[];

  /**
   * What this key's traffic will be used FOR, matched against each
   * contributor's itemised VDCL grants. Optional at the API boundary so
   * existing integrations keep working, but a key with no declared purpose
   * streams nothing once VDCL enforcement is on -- it is denied rather than
   * defaulted, since guessing would hand a subscriber a use the contributor
   * may have refused.
   */
  @IsOptional()
  @IsArray()
  @IsEnum(VdclPurpose, { each: true })
  purposes?: VdclPurpose[];

  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  allowedIps?: string[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
