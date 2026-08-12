import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { LlmModule } from '../llm/llm.module';
import { GeoController } from './geo.controller';

@Module({
  imports: [SettingsModule, LlmModule],
  controllers: [GeoController],
})
export class GeoModule {}
