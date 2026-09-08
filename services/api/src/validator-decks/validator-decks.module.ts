import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { SettingsModule } from '../settings/settings.module';
import { ValidatorDecksController, ValidatorRecordingsController } from './validator-decks.controller';
import { AdminValidatorDecksController } from './admin-validator-decks.controller';
import { ValidatorDecksService } from './validator-decks.service';
import { ValidatorRecordingsService } from './validator-recordings.service';

@Module({
  imports: [StorageModule, SettingsModule],
  controllers: [ValidatorDecksController, ValidatorRecordingsController, AdminValidatorDecksController],
  providers: [ValidatorDecksService, ValidatorRecordingsService],
})
export class ValidatorDecksModule {}
