import { Module } from '@nestjs/common';
import { CoinbaseCommerceService } from './coinbase-commerce.service';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [CoinbaseCommerceService],
})
export class WalletModule {}
