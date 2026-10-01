import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * A subscriber editing their own personal details.
 *
 * Deliberately only the name fields. `email` is the account's unique
 * identifier and its verification state (`emailVerifiedAt`) is derived from
 * it, so changing it is a re-verification flow rather than a profile edit;
 * `passwordHash` has its own endpoint for the same reason.
 */
export class UpdateSubscriberProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;
}
