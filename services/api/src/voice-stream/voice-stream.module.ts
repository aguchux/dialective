import { Module } from '@nestjs/common';
import { SubscriberAuthModule } from './subscriber-auth/subscriber-auth.module';
import { SubscriberOrgsModule } from './subscriber-orgs/subscriber-orgs.module';
import { BillingModule } from './billing/billing.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { StreamDecksModule } from './stream-decks/stream-decks.module';
import { IsvpModule } from './isvp/isvp.module';
import { StreamApiModule } from './stream-api/stream-api.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ReportsModule } from './reports/reports.module';
import { AnomalyDetectionModule } from './anomaly-detection/anomaly-detection.module';

/**
 * Dialect Library Voice Stream -- Phase 1 (Subscriber Foundation). See
 * docs/Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md. A fully separate
 * commercial tenant boundary from the trainer-facing modules elsewhere in
 * this app -- its own auth (subscriber-auth), org/team management
 * (subscriber-orgs), Stripe billing (billing), read-only recording search
 * (catalogue), and curated collections (stream-decks).
 */
@Module({
  imports: [
    SubscriberAuthModule,
    SubscriberOrgsModule,
    BillingModule,
    CatalogueModule,
    StreamDecksModule,
    IsvpModule,
    StreamApiModule,
    WebhooksModule,
    ReportsModule,
    AnomalyDetectionModule,
  ],
})
export class VoiceStreamModule {}
