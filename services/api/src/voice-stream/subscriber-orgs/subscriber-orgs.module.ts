import { Module } from '@nestjs/common';
import { SubscriberOrgsController } from './subscriber-orgs.controller';
import { SubscriberOrgsService } from './subscriber-orgs.service';

@Module({
  controllers: [SubscriberOrgsController],
  providers: [SubscriberOrgsService],
})
export class SubscriberOrgsModule {}
