import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRecordingsService } from './admin-recordings.service';
import { ListTrainerRecordingsDto } from './dto/list-trainer-recordings.dto';
import { ListAllRecordingsDto } from './dto/list-all-recordings.dto';
import { AuditRecordingDto } from './dto/audit-recording.dto';

@Controller('admin-recordings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminRecordingsController {
  constructor(private readonly recordings: AdminRecordingsService) {}

  @Get()
  listAll(@Query() query: ListAllRecordingsDto) {
    return this.recordings.listAll(query);
  }

  /**
   * Per-dialect ASR coverage. Deliberately sits above the :trainerId route
   * so "asr-coverage" is never read as a trainer id.
   */
  @Get('asr-coverage')
  asrCoverage() {
    return this.recordings.asrCoverage();
  }

  @Get('trainers/:trainerId')
  listForTrainer(@Param('trainerId') trainerId: string, @Query() query: ListTrainerRecordingsDto) {
    return this.recordings.listForTrainer(trainerId, query);
  }

  @Post(':id/audit/otp')
  requestAuditClawbackOtp(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.recordings.requestAuditClawbackOtp(req.user.sub, id);
  }

  @Post(':id/audit')
  audit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: AuditRecordingDto) {
    return this.recordings.audit(req.user.sub, id, dto);
  }
}
