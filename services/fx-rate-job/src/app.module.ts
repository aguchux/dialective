import { Module } from '@nestjs/common';
import { FxRateService } from './fx-rate.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FxRateService],
})
export class AppModule {}
