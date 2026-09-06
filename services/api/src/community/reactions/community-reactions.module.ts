import { Module } from '@nestjs/common';
import { CommunitySettingsModule } from '../settings/community-settings.module';
import { CommunityReactionsController } from './community-reactions.controller';
import { CommunityReactionsService } from './community-reactions.service';

@Module({
  imports: [CommunitySettingsModule],
  controllers: [CommunityReactionsController],
  providers: [CommunityReactionsService],
})
export class CommunityReactionsModule {}
