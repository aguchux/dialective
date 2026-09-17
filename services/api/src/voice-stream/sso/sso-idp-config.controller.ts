import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { SsoEntitlementGuard } from './sso-entitlement.guard';
import { SsoIdpConfigService } from './sso-idp-config.service';
import { CreateSsoIdpConfigDto } from './dto/create-sso-idp-config.dto';
import { UpdateSsoIdpConfigDto } from './dto/update-sso-idp-config.dto';

/** SSO config changes who can log in to the organization -- more sensitive than OAuth client management, so restricted to OWNER/ADMIN only (not DATASET_MANAGER/API_DEVELOPER, unlike CAN_MANAGE_CLIENTS in oauth-clients.controller.ts). */
const CAN_MANAGE_SSO = [SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN];

@Controller('voice-stream/sso/config')
@UseGuards(SubscriberAuthGuard)
export class SsoIdpConfigController {
  constructor(private readonly config: SsoIdpConfigService) {}

  @Get()
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_SSO)
  get(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.config.get(subscriber.organizationId);
  }

  @Post()
  @UseGuards(SubscriberRolesGuard, SsoEntitlementGuard)
  @SubscriberRoles(...CAN_MANAGE_SSO)
  create(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: CreateSsoIdpConfigDto,
  ) {
    return this.config.create(subscriber.organizationId, subscriber.sub, dto);
  }

  @Patch()
  @UseGuards(SubscriberRolesGuard, SsoEntitlementGuard)
  @SubscriberRoles(...CAN_MANAGE_SSO)
  update(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: UpdateSsoIdpConfigDto,
  ) {
    return this.config.update(subscriber.organizationId, subscriber.sub, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_MANAGE_SSO)
  async remove(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims): Promise<void> {
    await this.config.remove(subscriber.organizationId, subscriber.sub);
  }
}
