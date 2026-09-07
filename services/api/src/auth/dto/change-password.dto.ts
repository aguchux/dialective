import { IsOptional, IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/password-strength.util';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @IsStrongPassword()
  newPassword!: string;

  // The presented session's own refresh token -- kept alive across the
  // password change while every other session is revoked. Optional so a
  // client that only holds an access token (refresh stored elsewhere) can
  // still change its password, just without preserving its own session.
  @IsOptional()
  @IsString()
  currentRefreshToken?: string;
}
