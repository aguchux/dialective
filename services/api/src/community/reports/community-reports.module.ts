import { Module } from '@nestjs/common';
import { AdminCommunityReportsController } from './admin-community-reports.controller';
import { CommunityReportsController } from './community-reports.controller';
import { CommunityReportsService } from './community-reports.service';

@Module({
  controllers: [CommunityReportsController, AdminCommunityReportsController],
  providers: [CommunityReportsService],
})
export class CommunityReportsModule {}
