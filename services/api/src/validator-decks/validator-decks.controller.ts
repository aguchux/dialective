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
  list(@Req() req: AuthenticatedRequest, @Query('filter') filter?: 'mine' | 'all') {
    return this.decks.list(filter === 'all' ? 'all' : 'mine', req.user.sub);
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
