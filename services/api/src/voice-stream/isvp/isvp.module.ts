import { Module } from '@nestjs/common';
import { RedisStreamsModule } from '../../redis-streams/redis-streams.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { IsvpController } from './isvp.controller';
import { IsvpService } from './isvp.service';

@Module({
  imports: [RedisStreamsModule, CatalogueModule, WebhooksModule],
  controllers: [IsvpController],
  providers: [IsvpService],
})
export class IsvpModule {}
