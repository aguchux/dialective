import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SettingsModule } from '../settings/settings.module';
import { RedisStreamsModule } from '../redis-streams/redis-streams.module';
import { CoursesModule } from '../courses/courses.module';
import { DomainConversationsController } from './domain-conversations.controller';
import { DomainConversationsService } from './domain-conversations.service';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';

@Module({
  imports: [StorageModule, SettingsModule, RedisStreamsModule, CoursesModule],
  controllers: [DomainConversationsController],
  providers: [DomainConversationsService, SubmissionRateLimitGuard],
})
export class DomainConversationsModule {}
