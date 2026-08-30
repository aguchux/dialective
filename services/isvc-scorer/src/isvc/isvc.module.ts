import { Module } from '@nestjs/common';
import { RedisStreamsModule } from '../redis-streams/redis-streams.module';
import { IsvcService } from './isvc.service';

@Module({
  imports: [RedisStreamsModule],
  providers: [IsvcService],
})
export class IsvcModule {}
