import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { DiditService } from './didit.service';

@Module({
  controllers: [KycController],
  providers: [KycService, DiditService],
})
export class KycModule {}
