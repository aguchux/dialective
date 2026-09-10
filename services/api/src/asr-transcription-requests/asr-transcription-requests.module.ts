import { Module } from '@nestjs/common';
import { AsrTranscriptionRequestsController } from './asr-transcription-requests.controller';
import { AsrTranscriptionRequestsService } from './asr-transcription-requests.service';

@Module({
  controllers: [AsrTranscriptionRequestsController],
  providers: [AsrTranscriptionRequestsService],
})
export class AsrTranscriptionRequestsModule {}
