import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import {
  OptionalJwtAuthGuard,
  OptionallyAuthenticatedRequest,
} from '../../auth/strategies/optional-jwt-auth.guard';
import { CommunityProfilesService } from '../profiles/community-profiles.service';
import { CommunitySpacesService } from './community-spaces.service';

@Controller('community/spaces')
export class CommunitySpacesController {
  constructor(
    private readonly spaces: CommunitySpacesService,
    private readonly profiles: CommunityProfilesService,
  ) {}

  // Content is public and shareable -- see CommunityPostsController's list().
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(@Req() req: OptionallyAuthenticatedRequest) {
    return this.spaces.list(req.user?.sub);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  getBySlug(@Req() req: OptionallyAuthenticatedRequest, @Param('slug') slug: string) {
    return this.spaces.getBySlug(slug, req.user?.sub);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async join(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const profile = await this.profiles.ensureProfile(req.user.sub);
    await this.spaces.join(profile.id, id);
    return { joined: true };
  }

  // The community app's frontend (community/store/api.ts) calls POST
  // .../leave, not DELETE .../join -- kept both routes rather than changing
  // the frontend contract, since DELETE .../join was already live and this
  // is purely additive.
  @Post(':id/leave')
  @Delete(':id/join')
  @UseGuards(JwtAuthGuard)
  async leave(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const profile = await this.profiles.ensureProfile(req.user.sub);
    await this.spaces.leave(profile.id, id);
    return { joined: false };
  }
}
