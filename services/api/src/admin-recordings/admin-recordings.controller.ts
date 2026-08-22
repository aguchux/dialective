import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRecordingsService, RecordingKind } from './admin-recordings.service';
import { ListTrainerRecordingsDto } from './dto/list-trainer-recordings.dto';
import { ListAllRecordingsDto } from './dto/list-all-recordings.dto';
import { AuditRecordingDto } from './dto/audit-recording.dto';

const RECORDING_KINDS: RecordingKind[] = ['word', 'submission'];

@Controller('admin-recordings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminRecordingsController {
  constructor(private readonly recordings: AdminRecordingsService) {}

  @Get()
  listAll(@Query() query: ListAllRecordingsDto) {
    return this.recordings.listAll(query);
  }

  @Get('trainers/:trainerId')
  listForTrainer(@Param('trainerId') trainerId: string, @Query() query: ListTrainerRecordingsDto) {
    return this.recordings.listForTrainer(trainerId, query);
  }

  @Post(':kind/:id/audit/otp')
  requestAuditClawbackOtp(
    @Req() req: AuthenticatedRequest,
    @Param('kind', new ParseEnumPipe(RECORDING_KINDS)) kind: RecordingKind,
    @Param('id') id: string,
  ) {
    return this.recordings.requestAuditClawbackOtp(req.user.sub, kind, id);
  }

  @Post(':kind/:id/audit')
  audit(
    @Req() req: AuthenticatedRequest,
    @Param('kind', new ParseEnumPipe(RECORDING_KINDS)) kind: RecordingKind,
    @Param('id') id: string,
    @Body() dto: AuditRecordingDto,
  ) {
    return this.recordings.audit(req.user.sub, kind, id, dto);
  }
}
