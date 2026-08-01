import { Module } from '@nestjs/common';
import { SettlementService } from './settlement.service';

@Module({
  providers: [SettlementService],
})
export class AppModule {}
