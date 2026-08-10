import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { RedisStreamsModule } from '../redis-streams/redis-streams.module';
import { AsrRegistryModule } from '../asr-registry/asr-registry.module';
import { SettingsModule } from '../settings/settings.module';
import { SubmissionsController } from './submissions.controller';

@Module({
  imports: [StorageModule, RedisStreamsModule, AsrRegistryModule, SettingsModule],
  controllers: [SubmissionsController],
})
export class SubmissionsModule {}
