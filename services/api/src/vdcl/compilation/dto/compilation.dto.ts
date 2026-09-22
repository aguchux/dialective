import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { VdclPurpose } from '@dialectiva/db';

/**
 * Purposes that may never be granted through this API.
 *
 * VOICE_CLONING exists in the enum so the schema can represent a refusal,
 * and so a future decision to offer it is a deliberate code change rather
 * than a checkbox someone ticks. It is not offered in v1, and an API that
 * accepted it would make that policy decorative.
 */
const NEVER_OFFERED: VdclPurpose[] = [VdclPurpose.VOICE_CLONING];

export class CreateVdclDraftDto {
  @IsString()
  @MinLength(1)
  contributorId!: string;

  @IsString()
  @Matches(/^[a-z0-9-]{2,32}$/, {
    message: 'dialectTag must be a lowercase dialect tag',
  })
  dialectTag!: string;

  @IsOptional()
  @IsString()
  countryId?: string;

  /**
   * The purposes this version grants. ALL of them must be granted for a
   * subscriber to stream, so this list is the whole of what the licence
   * permits -- there is no implicit baseline.
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(VdclPurpose, { each: true })
  purposes!: VdclPurpose[];

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  wordingVersion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  termsVersion?: string;
}

export function assertOfferablePurposes(purposes: VdclPurpose[]): void {
  const refused = purposes.filter((p) => NEVER_OFFERED.includes(p));
  if (refused.length > 0) {
    throw new Error(`These purposes are not offered: ${refused.join(', ')}`);
  }
}

export class PreviewInventoryDto {
  @IsString()
  @MinLength(1)
  contributorId!: string;

  @IsString()
  @Matches(/^[a-z0-9-]{2,32}$/)
  dialectTag!: string;
}

export class InspectManifestDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  page?: number;
}
