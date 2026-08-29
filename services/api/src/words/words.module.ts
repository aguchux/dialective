import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { WordsController } from './words.controller';
import { SettingsModule } from '../settings/settings.module';
import { RedisStreamsModule } from '../redis-streams/redis-streams.module';
import { LlmModule } from '../llm/llm.module';
import { CoursesModule } from '../courses/courses.module';
import { AsrRegistryModule } from '../asr-registry/asr-registry.module';
import { MailModule } from '../mail/mail.module';
import { WordsService } from './words.service';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';

@Module({
  imports: [
    StorageModule,
    SettingsModule,
    RedisStreamsModule,
    LlmModule,
    CoursesModule,
    AsrRegistryModule,
    MailModule,
  ],
  controllers: [WordsController],
  providers: [WordsService, SubmissionRateLimitGuard],
})
export class WordsModule {}
