import { IsNotEmpty, IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/password-strength.util';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}
