import { Module } from '@nestjs/common';
import { OrgActivityModule } from '../org-activity/org-activity.module';
import { SubscriberAuthModule } from '../subscriber-auth/subscriber-auth.module';
import { SecurityPolicyController } from './security-policy.controller';
import { SecurityPolicyService } from './security-policy.service';
import { SecurityPolicyEntitlementGuard } from './security-policy-entitlement.guard';
import { ApiKeyRolePolicyGuard } from './api-key-role-policy.guard';

@Module({
  imports: [OrgActivityModule, SubscriberAuthModule],
  controllers: [SecurityPolicyController],
  providers: [SecurityPolicyService, SecurityPolicyEntitlementGuard, ApiKeyRolePolicyGuard],
  exports: [SecurityPolicyEntitlementGuard, ApiKeyRolePolicyGuard],
})
export class SecurityPolicyModule {}
