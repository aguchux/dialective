import { Module } from '@nestjs/common';
import { GoogleAnalyticsService } from './google-analytics.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [GoogleAnalyticsService],
})
export class AppModule {}
