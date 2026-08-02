import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { RedisStreamsModule } from '../redis-streams/redis-streams.module';
import { AsrRegistryModule } from '../asr-registry/asr-registry.module';
import { SubmissionsController } from './submissions.controller';

@Module({
  imports: [StorageModule, RedisStreamsModule, AsrRegistryModule],
  controllers: [SubmissionsController],
})
export class SubmissionsModule {}
