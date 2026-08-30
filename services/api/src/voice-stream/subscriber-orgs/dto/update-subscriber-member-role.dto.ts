import { IsEnum } from 'class-validator';
import { SubscriberOrgRole } from '@dialectiva/db';

export class UpdateSubscriberMemberRoleDto {
  @IsEnum(SubscriberOrgRole)
  role!: SubscriberOrgRole;
}
