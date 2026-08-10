import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { PoolsController } from './pools.controller';

@Module({
  imports: [SettingsModule],
  controllers: [PoolsController],
})
export class PoolsModule {}
