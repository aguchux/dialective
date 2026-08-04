import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { WordsController } from './words.controller';

@Module({
  imports: [StorageModule],
  controllers: [WordsController],
})
export class WordsModule {}
