import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { OtpModule } from '../otp/otp.module';
import { MailModule } from '../mail/mail.module';
import { NowPaymentsService } from './nowpayments.service';
import { WalletController } from './wallet.controller';
import { WithdrawalReconciliationService } from './withdrawal-reconciliation.service';
import { TokenomicsModule } from '../tokenomics/tokenomics.module';

@Module({
  imports: [SettingsModule, OtpModule, MailModule, TokenomicsModule],
  controllers: [WalletController],
  providers: [NowPaymentsService, WithdrawalReconciliationService],
  exports: [WithdrawalReconciliationService],
})
export class WalletModule {}
