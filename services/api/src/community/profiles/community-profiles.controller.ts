import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../../auth/strategies/jwt-auth.guard';
import { UpdateCommunityProfileDto } from '../dto/update-community-profile.dto';
import { CommunityProfilesService } from './community-profiles.service';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityProfilesController {
  constructor(private readonly profiles: CommunityProfilesService) {}

  @Get('me/profile')
  getMine(@Req() req: AuthenticatedRequest) {
    return this.profiles.getMine(req.user.sub);
  }

  @Patch('me/profile')
  updateMine(@Req() req: AuthenticatedRequest, @Body() dto: UpdateCommunityProfileDto) {
    return this.profiles.updateMine(req.user.sub, dto);
  }

  @Get('users/:userId/profile')
  getByUserId(@Param('userId') userId: string) {
    return this.profiles.getByUserId(userId);
  }
}
