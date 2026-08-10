import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { GeoController } from './geo.controller';

@Module({
  imports: [SettingsModule],
  controllers: [GeoController],
})
export class GeoModule {}
