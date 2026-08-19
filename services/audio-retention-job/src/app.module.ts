import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { StorageService } from './storage.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RetentionService, StorageService],
})
export class AppModule {}
