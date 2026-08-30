import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { BillingModule } from '../billing/billing.module';
import { RedisStreamsModule } from '../../redis-streams/redis-streams.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { StreamDecksController } from './stream-decks.controller';
import { StreamDecksService } from './stream-decks.service';
import { StreamDeckVersioningService } from './stream-deck-versioning.service';
import { SmartDeckEvaluatorService } from './smart-deck-evaluator.service';

@Module({
  imports: [CatalogueModule, BillingModule, RedisStreamsModule, WebhooksModule],
  controllers: [StreamDecksController],
  providers: [StreamDecksService, StreamDeckVersioningService, SmartDeckEvaluatorService],
  exports: [StreamDecksService, StreamDeckVersioningService],
})
export class StreamDecksModule {}
