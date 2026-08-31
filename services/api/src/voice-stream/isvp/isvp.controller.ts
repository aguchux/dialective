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
import { RejectValidationDto } from './dto/reject-validation.dto';

const CAN_VALIDATE = [
  SubscriberOrgRole.OWNER,
  SubscriberOrgRole.ADMIN,
  SubscriberOrgRole.DATASET_MANAGER,
  SubscriberOrgRole.VALIDATOR,
];

// Peer review is deliberately narrower than CAN_VALIDATE -- a VALIDATOR
// can submit but not approve/reject (even their own org's queue), so
// review always comes from someone with broader org authority.
const CAN_REVIEW = [SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN, SubscriberOrgRole.DATASET_MANAGER];

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

  @Get('queue')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_REVIEW)
  listQueue(@CurrentSubscriber() subscriber: SubscriberAccessTokenClaims) {
    return this.isvp.listQueue(subscriber.organizationId);
  }

  @Post(':validationId/approve')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_REVIEW)
  approve(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('validationId') validationId: string,
  ) {
    return this.isvp.approve(subscriber.organizationId, subscriber.sub, validationId);
  }

  @Post(':validationId/reject')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_REVIEW)
  reject(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('validationId') validationId: string,
    @Body() dto: RejectValidationDto,
  ) {
    return this.isvp.reject(subscriber.organizationId, subscriber.sub, validationId, dto);
  }

  @Get(':validationId/audit-log')
  @UseGuards(SubscriberRolesGuard)
  @SubscriberRoles(...CAN_REVIEW)
  getAuditLog(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Param('validationId') validationId: string,
  ) {
    return this.isvp.getAuditLog(subscriber.organizationId, validationId);
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
