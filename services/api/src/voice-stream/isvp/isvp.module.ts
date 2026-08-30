import { Module } from '@nestjs/common';
import { RedisStreamsModule } from '../../redis-streams/redis-streams.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { IsvpController } from './isvp.controller';
import { IsvpService } from './isvp.service';

@Module({
  imports: [RedisStreamsModule, CatalogueModule],
  controllers: [IsvpController],
  providers: [IsvpService],
})
export class IsvpModule {}
