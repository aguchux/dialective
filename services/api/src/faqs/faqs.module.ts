import { Module } from '@nestjs/common';
import { FaqsAdminController, FaqsPublicController } from './faqs.controller';
import { FaqsService } from './faqs.service';

@Module({
  controllers: [FaqsPublicController, FaqsAdminController],
  providers: [FaqsService],
  exports: [FaqsService],
})
export class FaqsModule {}
