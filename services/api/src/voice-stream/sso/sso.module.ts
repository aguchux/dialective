import { Module } from '@nestjs/common';
import { OrgActivityModule } from '../org-activity/org-activity.module';
import { SubscriberAuthModule } from '../subscriber-auth/subscriber-auth.module';
import { SsoIdpConfigController } from './sso-idp-config.controller';
import { SsoAcsController } from './sso-acs.controller';
import { SsoIdpConfigService } from './sso-idp-config.service';
import { SsoService } from './sso.service';
import { SsoEntitlementGuard } from './sso-entitlement.guard';

@Module({
  imports: [OrgActivityModule, SubscriberAuthModule],
  controllers: [SsoIdpConfigController, SsoAcsController],
  providers: [SsoIdpConfigService, SsoService, SsoEntitlementGuard],
})
export class SsoModule {}
