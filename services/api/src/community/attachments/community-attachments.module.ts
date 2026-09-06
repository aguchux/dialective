import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { CommunityAttachmentsController } from './community-attachments.controller';
import { CommunityAttachmentsService } from './community-attachments.service';

@Module({
  imports: [StorageModule],
  controllers: [CommunityAttachmentsController],
  providers: [CommunityAttachmentsService],
  exports: [CommunityAttachmentsService],
})
export class CommunityAttachmentsModule {}
