import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthService } from './subscriber-auth.service';
import { RegisterSubscriberDto } from './dto/register-subscriber.dto';
import { LoginSubscriberDto } from './dto/login-subscriber.dto';
import { VerifySubscriberOtpDto } from './dto/verify-subscriber-otp.dto';
import { ResendSubscriberOtpDto } from './dto/resend-subscriber-otp.dto';
import { SubscriberRefreshDto } from './dto/subscriber-refresh.dto';
import { InviteSubscriberMemberDto } from './dto/invite-subscriber-member.dto';
import { AcceptSubscriberInviteDto } from './dto/accept-subscriber-invite.dto';
import { SubscriberAuthGuard } from './subscriber-auth.guard';
import { SubscriberRolesGuard } from './subscriber-roles.guard';
import { SubscriberRoles } from './subscriber-roles.decorator';
import { CurrentSubscriber } from './current-subscriber.decorator';
import { SubscriberAccessTokenClaims } from './subscriber-jwt.util';

@Controller('voice-stream/auth')
export class SubscriberAuthController {
  constructor(private readonly auth: SubscriberAuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  register(@Body() dto: RegisterSubscriberDto) {
    return this.auth.register(
      dto.email,
      dto.password,
      dto.firstName,
      dto.lastName,
      dto.organizationName,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  login(@Body() dto: LoginSubscriberDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  verifyOtp(@Body() dto: VerifySubscriberOtpDto) {
    return this.auth.verifyOtp(dto.ticket, dto.code);
  }

  @Post('otp/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  async resendOtp(@Body() dto: ResendSubscriberOtpDto): Promise<void> {
    await this.auth.resendOtp(dto.ticket);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: SubscriberRefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: SubscriberRefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('invites')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SubscriberAuthGuard, SubscriberRolesGuard)
  @SubscriberRoles(SubscriberOrgRole.OWNER, SubscriberOrgRole.ADMIN)
  async inviteMember(
    @CurrentSubscriber() subscriber: SubscriberAccessTokenClaims,
    @Body() dto: InviteSubscriberMemberDto,
  ): Promise<void> {
    await this.auth.inviteMember(subscriber.organizationId, subscriber.sub, dto.email, dto.role);
  }

  @Post('invites/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvite(@Body() dto: AcceptSubscriberInviteDto) {
    return this.auth.acceptInvite(dto.token, dto.password);
  }
}
