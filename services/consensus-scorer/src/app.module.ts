import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { ConsensusModule } from './consensus/consensus.module';

@Module({
  imports: [ConsensusModule],
  controllers: [HealthController],
})
export class AppModule {}
