import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { OtpModule } from '../otp/otp.module';
import { MailModule } from '../mail/mail.module';
import { NowPaymentsService } from './nowpayments.service';
import { FlutterwaveService } from './flutterwave.service';
import { WalletController } from './wallet.controller';
import { PayoutAccountsController } from './payout-accounts.controller';
import { WithdrawalReconciliationService } from './withdrawal-reconciliation.service';
import { TokenomicsModule } from '../tokenomics/tokenomics.module';

@Module({
  imports: [SettingsModule, OtpModule, MailModule, TokenomicsModule],
  controllers: [WalletController, PayoutAccountsController],
  providers: [NowPaymentsService, FlutterwaveService, WithdrawalReconciliationService],
  exports: [WithdrawalReconciliationService, FlutterwaveService],
})
export class WalletModule {}
