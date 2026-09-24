import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { VdclEnabledGuard } from '../vdcl-enabled.guard';
import { ContributorDecksService } from './contributor-decks.service';

interface AuthedRequest {
  user: { sub: string };
}

/**
 * A contributor's own decks.
 *
 * Same boundaries as the maker controller it sits beside: the contributor
 * comes from the JWT and never from a parameter, and it is behind
 * VdclEnabledGuard because decks only exist once licensing is open.
 */
@Controller('vdcl/decks')
@UseGuards(JwtAuthGuard, VdclEnabledGuard)
export class ContributorDecksController {
  constructor(private readonly decks: ContributorDecksService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.decks.listForContributor(req.user.sub);
  }
}
