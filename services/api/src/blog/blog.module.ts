import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { BlogAdminController, BlogPublicController } from './blog.controller';
import { BlogService } from './blog.service';

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [BlogPublicController, BlogAdminController],
  providers: [BlogService],
})
export class BlogModule {}
