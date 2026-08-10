import { IsEnum } from 'class-validator';
import { Role } from '@dialectiva/db';

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role!: Role;
}
