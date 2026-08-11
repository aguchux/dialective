import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { ConsumeMagicLinkDto } from './dto/consume-magic-link.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { OAuthCallbackGuard } from './guards/oauth-callback.guard';
import { JwtAuthGuard } from './strategies/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AccessTokenClaims } from './jwt.util';
import { Role, UserStatus } from '@dialectiva/db';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.firstName, dto.lastName, dto.referralCode);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.ticket, dto.code);
  }

  @Post('otp/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  async resendOtp(@Body() dto: ResendOtpDto): Promise<void> {
    await this.auth.resendOtp(dto.ticket);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
    await this.auth.requestPasswordReset(dto.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Post('magic-link/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestMagicLink(@Body() dto: RequestMagicLinkDto): Promise<void> {
    await this.auth.requestMagicLink(dto.email);
  }

  @Post('magic-link/callback')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OAuthCallbackGuard)
  consumeMagicLink(@Body() dto: ConsumeMagicLinkDto) {
    return this.auth.consumeMagicLink(dto.token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AccessTokenClaims) {
    return this.auth.getProfile(user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: AccessTokenClaims, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.sub, dto);
  }

  // --- Admin: user management ------------------------------------------------

  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listUsers(@Query('role') role?: Role, @Query('status') status?: UserStatus, @Query('search') search?: string) {
    return this.auth.listUsers({ role, status, search });
  }

  @Patch('admin/users/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateUserRole(@CurrentUser() admin: AccessTokenClaims, @Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    if (id === admin.sub && dto.role !== Role.ADMIN) {
      throw new BadRequestException('You cannot change your own role');
    }
    return this.auth.updateUserRole(id, dto.role);
  }

  @Patch('admin/users/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateUserStatus(@CurrentUser() admin: AccessTokenClaims, @Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    if (id === admin.sub && dto.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('You cannot suspend or block your own account');
    }
    return this.auth.updateUserStatus(id, dto.status);
  }
}
