import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthGuard } from '../subscriber-auth/subscriber-auth.guard';
import { SubscriberRolesGuard } from '../subscriber-auth/subscriber-roles.guard';
import { SubscriberRoles } from '../subscriber-auth/subscriber-roles.decorator';
import { CurrentSubscriber } from '../subscriber-auth/current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from '../subscriber-auth/subscriber-jwt.util';
import { RequireActiveSubscriptionGuard } from '../billing/require-active-subscription.guard';
import { IsvpService } from './isvp.service';
import { SubmitValidationDto } from './dto/submit-validation.dto';

const CAN_VALIDATE = [
  SubscriberOrgRole.OWNER,
  SubscriberOrgRole.ADMIN,
  SubscriberOrgRole.DATASET_MANAGER,
  SubscriberOrgRole.VALIDATOR,
];

@Controller('voice-stream/isvp')
@UseGuards(SubscriberAuthGuard)
export class IsvpController {
  constructor(private readonly isvp: IsvpService) {}

  @Post('recordings/:recordingId')
  @UseGuards(SubscriberRolesGuard, RequireActiveSubscriptionGuard)
  @SubscriberRoles(...CAN_VALIDATE)
  submit(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('recordingId') recordingId: string,
    @Body() dto: SubmitValidationDto,
  ) {
    return this.isvp.submit(subscriber.organizationId, subscriber.sub, recordingId, dto);
  }

  @Get('recordings/:recordingId/mine')
  listMineForRecording(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('recordingId') recordingId: string,
  ) {
    return this.isvp.listMine(subscriber.organizationId, recordingId);
  }

  @Get('mine')
  listMine(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Query('recordingId') recordingId?: string,
  ) {
    return this.isvp.listMine(subscriber.organizationId, recordingId);
  }

  @Get('contribution')
  getContribution(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.isvp.getOrgContribution(subscriber.organizationId);
  }
}
