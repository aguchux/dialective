import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { TrainerProfilesController } from './trainer-profiles.controller';
import { TrainerProfilesService } from './trainer-profiles.service';

@Module({
  imports: [StorageModule],
  controllers: [TrainerProfilesController],
  providers: [TrainerProfilesService],
})
export class TrainerProfilesModule {}
