import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SettingsModule } from '../settings/settings.module';
import { CoursesModule } from '../courses/courses.module';
import { WordValidationController } from './word-validation.controller';
import { WordValidationService } from './word-validation.service';
import { SubmissionRateLimitGuard } from '../common/guards/submission-rate-limit.guard';

@Module({
  imports: [StorageModule, SettingsModule, CoursesModule],
  controllers: [WordValidationController],
  providers: [WordValidationService, SubmissionRateLimitGuard],
})
export class WordValidationModule {}
