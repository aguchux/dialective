import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health/health.controller';
import { RedisStreamsModule } from './redis-streams/redis-streams.module';
import { RabbitMqModule } from './rabbitmq/rabbitmq.module';
import { AsrRegistryModule } from './asr-registry/asr-registry.module';
import { WordsModule } from './words/words.module';
import { DomainConversationsModule } from './domain-conversations/domain-conversations.module';
import { WordValidationModule } from './word-validation/word-validation.module';
import { SentencesModule } from './sentences/sentences.module';
import { TestimonialsModule } from './testimonials/testimonials.module';
import { MarketingModule } from './marketing/marketing.module';
import { DykModule } from './dyk/dyk.module';
import { WalletModule } from './wallet/wallet.module';
import { GeoModule } from './geo/geo.module';
import { LeadsModule } from './leads/leads.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { TrainingEconomyModule } from './training-economy/training-economy.module';
import { BlogModule } from './blog/blog.module';
import { CoursesModule } from './courses/courses.module';
import { P2PModule } from './p2p/p2p.module';
import { KycModule } from './kyc/kyc.module';
import { DistributorsModule } from './distributors/distributors.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminRecordingsModule } from './admin-recordings/admin-recordings.module';
import { ValidatorDecksModule } from './validator-decks/validator-decks.module';
import { DatasetStorageModule } from './dataset-storage/dataset-storage.module';
import { ApiAccessTokensModule } from './api-access-tokens/api-access-tokens.module';
import { ChatDialectModule } from './chatdialect/chatdialect.module';
import { TokenomicsModule } from './tokenomics/tokenomics.module';
import { AssistantModule } from './assistant/assistant.module';
import { SettlementAdminModule } from './settlement-admin/settlement-admin.module';
import { VoiceStreamModule } from './voice-stream/voice-stream.module';
import { VdclModule } from './vdcl/vdcl.module';
import { FaqsModule } from './faqs/faqs.module';
import { TrainerProfilesModule } from './trainer-profiles/trainer-profiles.module';
import { CommunityModule } from './community/community.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { WhatsAppValidatorModule } from './whatsapp-validator/whatsapp-validator.module';
import { KycPeerReviewModule } from './kyc-peer-review/kyc-peer-review.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisStreamsModule,
    RabbitMqModule,
    AsrRegistryModule,
    WordsModule,
    DomainConversationsModule,
    WordValidationModule,
    SentencesModule,
    TestimonialsModule,
    MarketingModule,
    DykModule,
    WalletModule,
    GeoModule,
    LeadsModule,
    AuthModule,
    SettingsModule,
    TrainingEconomyModule,
    AnalyticsModule,
    BlogModule,
    CoursesModule,
    P2PModule,
    KycModule,
    DistributorsModule,
    NotificationsModule,
    AdminRecordingsModule,
    ValidatorDecksModule,
    DatasetStorageModule,
    ApiAccessTokensModule,
    ChatDialectModule,
    TokenomicsModule,
    AssistantModule,
    SettlementAdminModule,
    VoiceStreamModule,
    VdclModule,
    FaqsModule,
    TrainerProfilesModule,
    CommunityModule,
    IntegrationsModule,
    PaymentMethodsModule,
    WhatsAppValidatorModule,
    KycPeerReviewModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
