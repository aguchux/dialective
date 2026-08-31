import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { BillingModule } from '../billing/billing.module';
import { StreamDecksModule } from '../stream-decks/stream-decks.module';
import { StorageModule } from '../../storage/storage.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { OAuthModule } from '../oauth/oauth.module';
import { OrgActivityModule } from '../org-activity/org-activity.module';
import { StreamKeysController } from './stream-keys.controller';
import { StreamKeysService } from './stream-keys.service';
import { StreamManifestController } from './stream-manifest.controller';
import { StreamManifestService } from './stream-manifest.service';
import { StreamAudioController } from './stream-audio.controller';
import { StreamAccessLogService } from './stream-access-log.service';
import { StreamKeyAuthGuard } from './stream-key-auth.guard';
import { StreamKeyScopesGuard } from './stream-key-scopes.guard';
import { StreamKeySubscriptionGuard } from './stream-key-subscription.guard';
import { StreamKeyRateLimitGuard } from './stream-key-rate-limit.guard';
import { ConcurrentStreamGuard } from './concurrent-stream.guard';
import { UsageCounterModule } from './usage-counter.module';
import { QuotaGuard } from './quota.guard';

/**
 * Dialect Library Voice Stream -- Phase 3 (Voice Stream API). Stream Key
 * management (dashboard-side, JWT-gated) plus the machine-client
 * manifest/metadata/audio/usage API (Stream-Key-gated). See
 * docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md sections 25-38.
 */
@Module({
  imports: [
    CatalogueModule,
    BillingModule,
    StreamDecksModule,
    StorageModule,
    WebhooksModule,
    OAuthModule,
    OrgActivityModule,
    UsageCounterModule,
  ],
  controllers: [StreamKeysController, StreamManifestController, StreamAudioController],
  providers: [
    StreamKeysService,
    StreamManifestService,
    StreamAccessLogService,
    QuotaGuard,
    StreamKeyAuthGuard,
    StreamKeyScopesGuard,
    StreamKeySubscriptionGuard,
    StreamKeyRateLimitGuard,
    ConcurrentStreamGuard,
  ],
})
export class StreamApiModule {}
