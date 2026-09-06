import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { CommunitySettingsModule } from '../settings/community-settings.module';
import { CommunityAttachmentsController } from './community-attachments.controller';
import { CommunityAttachmentsService } from './community-attachments.service';

@Module({
  imports: [StorageModule, CommunitySettingsModule],
  controllers: [CommunityAttachmentsController],
  providers: [CommunityAttachmentsService],
  exports: [CommunityAttachmentsService],
})
export class CommunityAttachmentsModule {}
