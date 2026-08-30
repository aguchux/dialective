import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { BillingModule } from '../billing/billing.module';
import { StreamDecksController } from './stream-decks.controller';
import { StreamDecksService } from './stream-decks.service';

@Module({
  imports: [CatalogueModule, BillingModule],
  controllers: [StreamDecksController],
  providers: [StreamDecksService],
})
export class StreamDecksModule {}
