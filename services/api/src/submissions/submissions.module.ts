import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SubmissionsController } from './submissions.controller';

@Module({
  imports: [StorageModule],
  controllers: [SubmissionsController],
})
export class SubmissionsModule {}
