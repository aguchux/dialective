import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { OtpModule } from '../otp/otp.module';
import { NowPaymentsService } from './nowpayments.service';
import { WalletController } from './wallet.controller';
import { WithdrawalReconciliationService } from './withdrawal-reconciliation.service';

@Module({
  imports: [SettingsModule, OtpModule],
  controllers: [WalletController],
  providers: [NowPaymentsService, WithdrawalReconciliationService],
  exports: [WithdrawalReconciliationService],
})
export class WalletModule {}
