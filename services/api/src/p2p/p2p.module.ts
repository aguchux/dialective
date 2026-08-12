import { Module } from '@nestjs/common';
import { P2PController } from './p2p.controller';
import { P2PService } from './p2p.service';

@Module({
  controllers: [P2PController],
  providers: [P2PService],
})
export class P2PModule {}
