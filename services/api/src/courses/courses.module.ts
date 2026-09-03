import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import {
  CoursesAdminController,
  CoursesProtectedController,
  CoursesPublicController,
} from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [StorageModule, NotificationsModule, MailModule],
  controllers: [CoursesPublicController, CoursesProtectedController, CoursesAdminController],
  providers: [CoursesService],
  // WordsModule imports this to call
  // CoursesService.getIncompleteRequiredCourses as its training-task gate.
  exports: [CoursesService],
})
export class CoursesModule {}
