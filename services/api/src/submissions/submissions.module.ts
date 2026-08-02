import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { RedisStreamsModule } from '../redis-streams/redis-streams.module';
import { SubmissionsController } from './submissions.controller';

@Module({
  imports: [StorageModule, RedisStreamsModule],
  controllers: [SubmissionsController],
})
export class SubmissionsModule {}
