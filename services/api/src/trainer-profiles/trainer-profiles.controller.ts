import { Controller, Get, Param } from '@nestjs/common';
import { TrainerProfilesService } from './trainer-profiles.service';

@Controller('trainers')
export class TrainerProfilesController {
  constructor(private readonly trainerProfiles: TrainerProfilesService) {}

  @Get(':referralCode')
  getPublicProfile(@Param('referralCode') referralCode: string) {
    return this.trainerProfiles.getPublicProfile(referralCode);
  }
}
