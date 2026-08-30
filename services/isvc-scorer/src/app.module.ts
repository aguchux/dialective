import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { IsvcModule } from './isvc/isvc.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, IsvcModule],
  controllers: [HealthController],
})
export class AppModule {}
