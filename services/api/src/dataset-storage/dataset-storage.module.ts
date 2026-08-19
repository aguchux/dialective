import { Module } from '@nestjs/common';
import { DatasetStorageController } from './dataset-storage.controller';
import { DatasetStorageService } from './dataset-storage.service';

@Module({
  controllers: [DatasetStorageController],
  providers: [DatasetStorageService],
})
export class DatasetStorageModule {}
