import { Module } from '@nestjs/common';
import { RedisStreamsService } from './redis-streams.service';

@Module({
  providers: [RedisStreamsService],
  exports: [RedisStreamsService],
})
export class RedisStreamsModule {}
