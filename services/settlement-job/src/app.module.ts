import { Module } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SettlementService],
})
export class AppModule {}
