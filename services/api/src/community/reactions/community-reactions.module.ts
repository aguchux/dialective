import { Module } from '@nestjs/common';
import { CommunityReactionsController } from './community-reactions.controller';
import { CommunityReactionsService } from './community-reactions.service';

@Module({
  controllers: [CommunityReactionsController],
  providers: [CommunityReactionsService],
})
export class CommunityReactionsModule {}
