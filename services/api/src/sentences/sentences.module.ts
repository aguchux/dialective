import { Module } from '@nestjs/common';
import { SentencesController } from './sentences.controller';

@Module({
  controllers: [SentencesController],
})
export class SentencesModule {}
