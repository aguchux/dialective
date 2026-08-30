import { SetMetadata } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';

export const SUBSCRIBER_ROLES_KEY = 'subscriberOrgRoles';
export const SubscriberRoles = (...roles: SubscriberOrgRole[]) =>
  SetMetadata(SUBSCRIBER_ROLES_KEY, roles);
