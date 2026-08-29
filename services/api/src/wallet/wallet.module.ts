import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { OtpModule } from '../otp/otp.module';
import { MailModule } from '../mail/mail.module';
import { NowPaymentsService } from './nowpayments.service';
import { FlutterwaveService } from './flutterwave.service';
import { FlutterwaveV4Service } from './flutterwave-v4.service';
import { WalletController } from './wallet.controller';
import { PayoutAccountsController } from './payout-accounts.controller';
import { WithdrawalReconciliationService } from './withdrawal-reconciliation.service';
import { TrainerReportService } from './trainer-report.service';
import { TokenomicsModule } from '../tokenomics/tokenomics.module';

@Module({
  imports: [SettingsModule, OtpModule, MailModule, TokenomicsModule],
  controllers: [WalletController, PayoutAccountsController],
  providers: [
    NowPaymentsService,
    FlutterwaveService,
    FlutterwaveV4Service,
    WithdrawalReconciliationService,
    TrainerReportService,
  ],
  exports: [
    WithdrawalReconciliationService,
    FlutterwaveService,
    FlutterwaveV4Service,
    TrainerReportService,
  ],
})
export class WalletModule {}
