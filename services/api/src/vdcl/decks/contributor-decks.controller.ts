import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { VdclEnabledGuard } from '../vdcl-enabled.guard';
import { ContributorDecksService } from './contributor-decks.service';
import { PublishContributorDeckDto } from './dto/publish-contributor-deck.dto';

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

  /**
   * Publish one dialect as a browsable deck on Stream.
   *
   * POST, not PATCH on a deck id, because the deck does not exist yet -- the
   * contributor is creating one from a dialect their licence covers. 200
   * rather than 201 since the response is the updated deck view the panel
   * re-renders from, not a bare location.
   *
   * No unpublish route exists, deliberately: see publishDeck's doc comment.
   * Revoking the licence is the lever, and it withdraws permission rather
   * than presence.
   */
  @Post('publish')
  @HttpCode(200)
  publish(@Req() req: AuthedRequest, @Body() body: PublishContributorDeckDto) {
    return this.decks.publishDeck(req.user.sub, body.dialectTag);
  }
}
