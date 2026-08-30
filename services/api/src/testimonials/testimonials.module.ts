import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminTestimonialsController } from './admin-testimonials.controller';
import { TestimonialsController } from './testimonials.controller';
import { TestimonialsService } from './testimonials.service';

@Module({
  imports: [StorageModule, SettingsModule],
  controllers: [TestimonialsController, AdminTestimonialsController],
  providers: [TestimonialsService],
})
export class TestimonialsModule {}
