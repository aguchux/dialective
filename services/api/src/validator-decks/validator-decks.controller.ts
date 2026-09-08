import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ValidatorDecksService } from './validator-decks.service';
import { ValidatorRecordingsService } from './validator-recordings.service';
import { CreateValidatorDeckDto } from './dto/create-validator-deck.dto';
import { UpdateValidatorDeckDto } from './dto/update-validator-deck.dto';
import { AddValidatorDeckItemDto } from './dto/add-validator-deck-item.dto';
import { ScoreValidatorDeckItemDto } from './dto/score-validator-deck-item.dto';
import { UpdateValidatorTranscriptDto } from './dto/update-validator-transcript.dto';
import { FlagValidatorDeckItemDto } from './dto/flag-validator-deck-item.dto';
import { RejectValidatorDeckDto } from './dto/reject-validator-deck.dto';
import { ListValidatorRecordingsDto } from './dto/list-validator-recordings.dto';

@Controller('validator/decks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VALIDATOR)
export class ValidatorDecksController {
  constructor(private readonly decks: ValidatorDecksService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateValidatorDeckDto) {
    return this.decks.create(req.user.sub, dto);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query('filter') filter?: 'mine' | 'all' | 'pendingMyApproval') {
    const resolved = filter === 'all' || filter === 'pendingMyApproval' ? filter : 'mine';
    return this.decks.list(resolved, req.user.sub);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.decks.getWithPreview(id);
  }

  @Patch(':id')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateValidatorDeckDto) {
    return this.decks.update(id, req.user.sub, req.user.role, dto);
  }

  @Post(':id/items')
  addItem(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: AddValidatorDeckItemDto) {
    return this.decks.addItem(id, req.user.sub, req.user.role, dto.recordingId);
  }

  @Delete(':id/items/:recordingId')
  removeItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('recordingId') recordingId: string,
  ) {
    return this.decks.removeItem(id, req.user.sub, req.user.role, recordingId);
  }

  @Post(':id/items/:recordingId/score')
  scoreItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('recordingId') recordingId: string,
    @Body() dto: ScoreValidatorDeckItemDto,
  ) {
    return this.decks.scoreItem(id, req.user.sub, req.user.role, recordingId, dto);
  }

  @Patch(':id/items/:recordingId/transcript')
  updateTranscript(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('recordingId') recordingId: string,
    @Body() dto: UpdateValidatorTranscriptDto,
  ) {
    return this.decks.updateTranscript(id, req.user.sub, req.user.role, recordingId, dto);
  }

  @Post(':id/items/:recordingId/flag')
  flagItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('recordingId') recordingId: string,
    @Body() dto: FlagValidatorDeckItemDto,
  ) {
    return this.decks.flagItem(id, req.user.sub, req.user.role, recordingId, dto);
  }

  @Post(':id/submit')
  submit(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.decks.submit(id, req.user.sub, req.user.role);
  }

  @Post(':id/approve')
  approve(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.decks.approve(id, req.user.sub, req.user.role);
  }

  @Post(':id/reject')
  reject(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: RejectValidatorDeckDto) {
    return this.decks.reject(id, req.user.sub, req.user.role, dto.reason);
  }

  @Get(':id/audit-log')
  getAuditLog(@Param('id') id: string) {
    return this.decks.getAuditLog(id);
  }
}

@Controller('validator/recordings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VALIDATOR)
export class ValidatorRecordingsController {
  constructor(private readonly recordings: ValidatorRecordingsService) {}

  @Get()
  listAll(@Query() query: ListValidatorRecordingsDto) {
    return this.recordings.listAll(query);
  }
}
