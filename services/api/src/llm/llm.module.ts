import { Module } from '@nestjs/common';
import { LlmNormalizerService } from './llm-normalizer.service';

@Module({
  providers: [LlmNormalizerService],
  exports: [LlmNormalizerService],
})
export class LlmModule {}
