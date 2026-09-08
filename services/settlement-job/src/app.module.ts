import { Module } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { StorageService } from './storage.service';
import { PrismaModule } from './prisma/prisma.module';
import { SmsNotifierService } from './sms/sms-notifier.service';

@Module({
  imports: [PrismaModule],
  providers: [SettlementService, StorageService, SmsNotifierService],
})
export class AppModule {}
