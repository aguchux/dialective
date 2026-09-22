import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
import { VdclPurpose } from '@dialectiva/db';

/**
 * Purposes a contributor may grant through the maker.
 *
 * VOICE_CLONING is absent deliberately, and its absence is enforced
 * server-side rather than by leaving it off a screen: it is never offered
 * in v1, and a policy that only exists in the UI is not a policy.
 *
 * The sensitive ones that ARE offered (BIOMETRIC_PROCESSING,
 * DATASET_REDISTRIBUTION, PUBLIC_PROMOTION) are here because the plan
 * requires them to be individually selectable -- never folded into a
 * general checkbox -- which means the API has to accept them individually.
 */
export const OFFERABLE_PURPOSES: VdclPurpose[] = [
  VdclPurpose.ASR_TRAINING,
  VdclPurpose.TTS_TRAINING,
  VdclPurpose.LLM_TRAINING,
  VdclPurpose.LINGUISTIC_RESEARCH,
  VdclPurpose.DATASET_REDISTRIBUTION,
  VdclPurpose.PUBLIC_PROMOTION,
  VdclPurpose.BIOMETRIC_PROCESSING,
];

export class StartVdclDraftDto {
  /**
   * The purposes being granted. Each is a separate, deliberate choice --
   * the consent cards are individually selected, so the API receives them
   * individually rather than as a single "accept" flag.
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(VdclPurpose, { each: true })
  purposes!: VdclPurpose[];

  /** Wording version of the consent cards the contributor actually saw. */
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  wordingVersion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  termsVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;
}

export class SignVdclVersionDto {
  @IsString()
  @MinLength(1)
  otpRequestId!: string;

  @IsString()
  @Length(4, 10)
  code!: string;

  @IsIn(['drawn', 'typed', 'digital'])
  signatureKind!: 'drawn' | 'typed' | 'digital';

  /**
   * The typed name or a reference to the drawn mark. Evidence of how the
   * signature was made, never treated as a credential -- the step-up OTP is
   * what authenticates the act.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  signatureLabel?: string;
}
