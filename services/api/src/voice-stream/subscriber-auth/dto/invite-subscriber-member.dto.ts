import { Transform } from 'class-transformer';
import { IsEmail, IsEnum } from 'class-validator';
import { SubscriberOrgRole } from '@dialectiva/db';

export class InviteSubscriberMemberDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;

  @IsEnum(SubscriberOrgRole)
  role!: SubscriberOrgRole;
}
