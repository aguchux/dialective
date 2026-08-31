import { Module } from '@nestjs/common';
import { OrgActivityModule } from '../org-activity/org-activity.module';
import { SubscriberOrgsController } from './subscriber-orgs.controller';
import { SubscriberOrgsService } from './subscriber-orgs.service';

@Module({
  imports: [OrgActivityModule],
  controllers: [SubscriberOrgsController],
  providers: [SubscriberOrgsService],
})
export class SubscriberOrgsModule {}
