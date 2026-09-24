import { IsBoolean } from 'class-validator';

/**
 * Which way the training economy is about to be switched.
 *
 * The direction is part of the OTP's context hash, so a code issued to stop
 * payouts cannot be replayed to resume them.
 */
export class TrainingEconomyOtpDto {
  @IsBoolean()
  enabling!: boolean;
}
