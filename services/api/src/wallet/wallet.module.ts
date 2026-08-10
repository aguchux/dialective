import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { NowPaymentsService } from './nowpayments.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [SettingsModule],
  controllers: [WalletController],
  providers: [NowPaymentsService],
})
export class WalletModule {}
