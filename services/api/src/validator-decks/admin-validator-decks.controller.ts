import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Role, ValidatorDeckStatus } from '@dialectiva/db';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ValidatorDecksService } from './validator-decks.service';
import { ReassignValidatorDeckDto } from './dto/reassign-validator-deck.dto';
import { CloneFromStreamDeckDto } from './dto/clone-from-stream-deck.dto';

@Controller('admin/validator-decks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminValidatorDecksController {
  constructor(private readonly decks: ValidatorDecksService) {}

  @Get()
  listAll(@Query('status') status?: ValidatorDeckStatus, @Query('ownerUserId') ownerUserId?: string) {
    return this.decks.adminListAll({ status, ownerUserId });
  }

  // Always bypass-approves regardless of the deck's current pending tier --
  // routes into the same ValidatorDecksService.approve() the validator-facing
  // endpoint uses, with callerRole='ADMIN' so its existing bypass branch
  // fires naturally (ADMIN_BYPASS_APPROVED unless the deck is already at
  // PENDING_ADMIN, in which case that's the normal APPROVED path).
  @Post(':id/approve')
  approve(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.decks.approve(id, req.user.sub, Role.ADMIN);
  }

  @Post(':id/publish')
  publish(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.decks.publish(id, req.user.sub);
  }

  @Post(':id/reassign')
  reassign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: ReassignValidatorDeckDto) {
    return this.decks.reassign(id, req.user.sub, dto.newOwnerUserId, dto.penaltyPercent);
  }

  @Post(':id/archive')
  archive(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.decks.archive(id, req.user.sub);
  }

  @Post('from-stream-deck')
  cloneFromStreamDeck(@Req() req: AuthenticatedRequest, @Body() dto: CloneFromStreamDeckDto) {
    return this.decks.adminCloneFromStreamDeck(dto.streamDeckId, dto.targetOwnerUserId, req.user.sub);
  }
}
