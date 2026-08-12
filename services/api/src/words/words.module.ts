import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { WordsController } from './words.controller';
import { SettingsModule } from '../settings/settings.module';
import { RedisStreamsModule } from '../redis-streams/redis-streams.module';
import { WordsService } from './words.service';

@Module({
  imports: [StorageModule, SettingsModule, RedisStreamsModule],
  controllers: [WordsController],
  providers: [WordsService],
})
export class WordsModule {}
