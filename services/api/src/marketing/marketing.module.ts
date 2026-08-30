import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { AdminMarketingController } from './admin-marketing.controller';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';

@Module({
  imports: [StorageModule],
  controllers: [MarketingController, AdminMarketingController],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
