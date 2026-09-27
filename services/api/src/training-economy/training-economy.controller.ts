import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { JwtAuthGuard } from '../auth/strategies/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TrainingEconomyStepUpService } from './training-economy-step-up.service';
import {
  ApplyTrainingEconomyDto,
  TrainingEconomyOtpDto,
} from './dto/training-economy-otp.dto';

/**
 * Issuing the step-up code for the training-economy switch.
 *
 * Sits under the settings path so the admin UI keeps one base URL, but in
 * its own module -- see TrainingEconomyStepUpService for why it cannot live
 * in SettingsModule.
 */
@Controller('admin/platform-settings/training-economy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TrainingEconomyController {
  constructor(private readonly stepUp: TrainingEconomyStepUpService) {}

  @Post('otp')
  requestOtp(@Body() dto: TrainingEconomyOtpDto, @Req() req: { user: { sub: string } }) {
    return this.stepUp.requestOtp(req.user.sub, dto.enabling);
  }

  /**
   * Apply the switch. One atomic action rather than a field on the settings
   * PATCH, so the step-up guards exactly this and nothing else.
   */
  @Post()
  apply(@Body() dto: ApplyTrainingEconomyDto, @Req() req: { user: { sub: string } }) {
    return this.stepUp.apply(req.user.sub, dto);
  }

  /**
   * The narrower, per-contributor switch: stop charging and paying trainers
   * who hold an active VDCL, because their voice is compensated through
   * Stream revenue sharing instead.
   *
   * Separate routes from the platform-wide switch above rather than a flag on
   * the same one, so a code issued for one can never apply to the other --
   * they have different blast radii, and the DTO shape being identical is
   * exactly why sharing an endpoint would be a hazard.
   */
  @Post('vdcl-suppression/otp')
  requestVdclSuppressionOtp(
    @Body() dto: TrainingEconomyOtpDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.stepUp.requestVdclSuppressionOtp(req.user.sub, dto.enabling);
  }

  @Post('vdcl-suppression')
  applyVdclSuppression(
    @Body() dto: ApplyTrainingEconomyDto,
    @Req() req: { user: { sub: string } },
  ) {
    return this.stepUp.applyVdclSuppression(req.user.sub, dto);
  }
}
