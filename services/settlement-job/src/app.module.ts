import { Module } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { StorageService } from './storage.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SettlementService, StorageService],
})
export class AppModule {}
