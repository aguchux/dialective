import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { RedisStreamsModule } from '../redis-streams/redis-streams.module';
import { AsrRegistryModule } from '../asr-registry/asr-registry.module';
import { SettingsModule } from '../settings/settings.module';
import { CoursesModule } from '../courses/courses.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';

@Module({
  imports: [StorageModule, RedisStreamsModule, AsrRegistryModule, SettingsModule, CoursesModule],
  controllers: [SubmissionsController],
  providers: [SubmissionRateLimitGuard],
})
export class SubmissionsModule {}
