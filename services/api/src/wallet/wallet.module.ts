import { Module } from '@nestjs/common';
import { NowPaymentsService } from './nowpayments.service';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [NowPaymentsService],
})
export class WalletModule {}
