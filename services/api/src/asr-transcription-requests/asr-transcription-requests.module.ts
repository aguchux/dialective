import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AsrTranscriptionRequestsController } from './asr-transcription-requests.controller';
import { AsrTranscriptionRequestsService } from './asr-transcription-requests.service';

@Module({
  imports: [SettingsModule],
  controllers: [AsrTranscriptionRequestsController],
  providers: [AsrTranscriptionRequestsService],
})
export class AsrTranscriptionRequestsModule {}
