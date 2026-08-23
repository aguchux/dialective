import { IsBoolean } from 'class-validator';

/**
 * Only isDefault is updatable here -- changing bank/mobile-money details is
 * delete + recreate (doc "sensitive payout change" framing), not a partial
 * update that could silently swap account numbers without OTP.
 */
export class UpdatePayoutAccountDto {
  @IsBoolean()
  isDefault!: boolean;
}
