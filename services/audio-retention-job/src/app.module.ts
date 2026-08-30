import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { StorageService } from './storage.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisStreamsModule } from './redis-streams/redis-streams.module';

@Module({
  imports: [PrismaModule, RedisStreamsModule],
  providers: [RetentionService, StorageService],
})
export class AppModule {}
