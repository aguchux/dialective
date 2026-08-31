import { Module } from '@nestjs/common';
import { OrgActivityService } from './org-activity.service';

@Module({
  providers: [OrgActivityService],
  exports: [OrgActivityService],
})
export class OrgActivityModule {}
