import { Module } from '@nestjs/common';
import { RedisStreamsModule } from '../redis-streams/redis-streams.module';
import { ConsensusService } from './consensus.service';

@Module({
  imports: [RedisStreamsModule],
  providers: [ConsensusService],
})
export class ConsensusModule {}
