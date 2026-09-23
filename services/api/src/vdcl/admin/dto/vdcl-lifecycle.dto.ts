import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { VdclVersionStatus } from '@dialectiva/db';

export class ListVdclAgreementsDto {
  @IsOptional()
  @IsEnum(VdclVersionStatus)
  status?: VdclVersionStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

/**
 * A reason is REQUIRED for suspension and withdrawal, not optional. Both
 * stop a contributor's work reaching subscribers, and an unexplained one is
 * unanswerable later -- the audit row is the only record of why.
 */
export class VdclReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  /**
   * Step-up, same optional-at-the-DTO-level reasoning as CountersignVdclDto
   * below: the gate is the adminPayoutOtpEnabled platform setting, and the
   * service refuses when it is on and these are absent.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(4, 10)
  code?: string;
}

/** A licence action that takes no reason, but still takes a step-up. */
export class VdclStepUpDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(4, 10)
  code?: string;
}

/** Which action a requested step-up code is for. */
export class RequestVdclActionOtpDto {
  @IsIn(['vdcl-suspend', 'vdcl-reinstate', 'vdcl-revoke', 'vdcl-withdraw', 'vdcl-reissue'])
  action!: 'vdcl-suspend' | 'vdcl-reinstate' | 'vdcl-revoke' | 'vdcl-withdraw' | 'vdcl-reissue';
}

/**
 * Step-up for countersignature.
 *
 * Optional at the DTO level because the gate is a platform setting
 * (adminPayoutOtpEnabled) -- the service refuses when the setting is on and
 * these are absent. Making them required here would break every admin the
 * moment that setting was turned off.
 */
export class CountersignVdclDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  otpRequestId?: string;

  @IsOptional()
  @IsString()
  @Length(4, 10)
  code?: string;
}
