import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AsrTranscriptionRequestsService } from './asr-transcription-requests.service';
import { CreateAsrTranscriptionRequestDto } from './dto/create-asr-transcription-request.dto';
import { ListAsrTranscriptionRequestsAdminDto } from './dto/list-asr-transcription-requests-admin.dto';
import { SetAsrTranscriptionRequestStatusDto } from './dto/set-asr-transcription-request-status.dto';

@Controller('asr-transcription-requests')
@UseGuards(JwtAuthGuard)
export class AsrTranscriptionRequestsController {
  constructor(private readonly requests: AsrTranscriptionRequestsService) {}

  @Get('mine')
  getMine(@Req() req: AuthenticatedRequest, @Query('dialectTag') dialectTag: string) {
    return this.requests.getMine(req.user.sub, dialectTag);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateAsrTranscriptionRequestDto) {
    return this.requests.createOrGetMine(req.user.sub, body.dialectTag);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listForAdmin(@Query() query: ListAsrTranscriptionRequestsAdminDto) {
    return this.requests.listForAdmin(query);
  }

  @Patch('admin/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  setStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SetAsrTranscriptionRequestStatusDto,
  ) {
    return this.requests.setStatus(id, req.user.sub, body.status);
  }
}
