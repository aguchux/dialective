import { IsEnum } from 'class-validator';
import { UserStatus } from '@dialectiva/db';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
