import { Module } from '@nestjs/common';
import { DistributorsController } from './distributors.controller';
import { DistributorsService } from './distributors.service';

@Module({
  controllers: [DistributorsController],
  providers: [DistributorsService],
})
export class DistributorsModule {}
