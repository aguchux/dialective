import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TokenomicsModule } from '../tokenomics/tokenomics.module';
import { SettlementAdminController } from './settlement-admin.controller';
import { SettlementAdminService } from './settlement-admin.service';

@Module({
  imports: [SettingsModule, TokenomicsModule],
  controllers: [SettlementAdminController],
  providers: [SettlementAdminService],
})
export class SettlementAdminModule {}
