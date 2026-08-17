import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { CoursesAdminController, CoursesProtectedController, CoursesPublicController } from './courses.controller';
import { CoursesService } from './courses.service';

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [CoursesPublicController, CoursesProtectedController, CoursesAdminController],
  providers: [CoursesService],
})
export class CoursesModule {}
