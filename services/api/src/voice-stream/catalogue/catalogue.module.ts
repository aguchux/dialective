import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { BillingModule } from '../billing/billing.module';
import { VdclModule } from '../../vdcl/vdcl.module';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';

@Module({
  imports: [StorageModule, BillingModule, VdclModule],
  controllers: [CatalogueController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
