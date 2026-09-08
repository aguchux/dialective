import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { RequestPhoneOtpDto } from './dto/request-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import { RequestManualPhoneVerificationDto } from './dto/request-manual-phone-verification.dto';
import { ListManualPhoneVerificationsDto } from './dto/list-manual-phone-verifications.dto';
import { VerifyManualPhoneVerificationDto } from './dto/verify-manual-phone-verification.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateTrainerRatingDto } from './dto/update-trainer-rating.dto';
import { UpdateValidatorLevelDto } from './dto/update-validator-level.dto';
import { LockUserDto } from './dto/lock-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateTwoFactorDto } from './dto/update-two-factor.dto';
import { CloseAccountDto } from './dto/close-account.dto';
import { ListUserActivityDto } from './dto/list-user-activity.dto';
import { JwtAuthGuard } from './strategies/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AccessTokenClaims } from './jwt.util';
import { Role, UserStatus } from '@dialectiva/db';
import { RegisterRateLimitGuard } from '../common/guards/register-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @UseGuards(RegisterRateLimitGuard)
  // ttl (window length) stays static; the enforced limit itself is read
  // from PlatformSettings.registerRateLimitPerHour by RegisterRateLimitGuard
  // (default 30/hour) so admin can retune it from Settings without a
  // redeploy -- this decorator's limit is only the pre-DI-resolution
  // fallback @nestjs/throttler needs at bootstrap.
  @Throttle({ default: { limit: 30, ttl: 60 * 60 * 1000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(
      dto.email,
      dto.password,
      dto.firstName,
      dto.lastName,
      dto.referralCode,
      dto.campaignShareId,
    );
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
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto): Promise<void> {
    await this.auth.requestPasswordReset(dto.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 10 * 60 * 1000 } })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  async changePassword(
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
      dto.currentRefreshToken,
    );
  }

  @Patch('me/two-factor')
  @UseGuards(JwtAuthGuard)
  updateTwoFactor(@CurrentUser() user: AccessTokenClaims, @Body() dto: UpdateTwoFactorDto) {
    return this.auth.updateTwoFactorSettings(user.sub, dto.emailEnabled, dto.smsEnabled);
  }

  @Post('me/close/otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  requestAccountCloseOtp(@CurrentUser() user: AccessTokenClaims) {
    return this.auth.requestAccountCloseOtp(user.sub);
  }

  @Post('me/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 10 * 60 * 1000 } })
  async closeAccount(
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: CloseAccountDto,
  ): Promise<void> {
    await this.auth.closeAccount(user.sub, dto.otpRequestId, dto.code);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(dto.token);
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  async resendEmailVerification(@CurrentUser() user: AccessTokenClaims): Promise<void> {
    await this.auth.resendEmailVerification(user.sub);
  }

  @Post('magic-link/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  async requestMagicLink(@Body() dto: RequestMagicLinkDto): Promise<void> {
    await this.auth.requestMagicLink(dto.email);
  }

  @Post('magic-link/callback')
  @HttpCode(HttpStatus.OK)
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

  @Post('me/pwa-install')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  recordPwaInstallation(@CurrentUser() user: AccessTokenClaims) {
    return this.auth.recordPwaInstallation(user.sub);
  }

  @Post('phone/otp')
  @UseGuards(JwtAuthGuard)
  requestPhoneOtp(@CurrentUser() user: AccessTokenClaims, @Body() dto: RequestPhoneOtpDto) {
    return this.auth.requestPhoneVerificationOtp(user.sub, dto.phoneNumber);
  }

  @Post('phone/verify')
  @UseGuards(JwtAuthGuard)
  verifyPhone(@CurrentUser() user: AccessTokenClaims, @Body() dto: VerifyPhoneOtpDto) {
    return this.auth.verifyPhoneNumber(user.sub, dto.phoneNumber, dto.otpRequestId, dto.code);
  }

  // Only reachable while PlatformSettings.phoneVerificationRequired is off
  // -- see AuthService.savePhoneNumberUnverified.
  @Patch('phone')
  @UseGuards(JwtAuthGuard)
  savePhoneUnverified(@CurrentUser() user: AccessTokenClaims, @Body() dto: RequestPhoneOtpDto) {
    return this.auth.savePhoneNumberUnverified(user.sub, dto.phoneNumber);
  }

  @Post('phone/manual/request')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  requestManualPhoneVerification(
    @CurrentUser() user: AccessTokenClaims,
    @Body() dto: RequestManualPhoneVerificationDto,
  ) {
    return this.auth.requestManualPhoneVerification(user.sub, dto.phoneNumber);
  }

  @Post('phone/manual/:id/sent')
  @UseGuards(JwtAuthGuard)
  markManualPhoneVerificationSent(@CurrentUser() user: AccessTokenClaims, @Param('id') id: string) {
    return this.auth.markManualPhoneVerificationSent(user.sub, id);
  }

  // --- Admin: user management ------------------------------------------------

  @Get('admin/phone-verifications')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listManualPhoneVerifications(@Query() query: ListManualPhoneVerificationsDto) {
    return this.auth.listManualPhoneVerificationRequests(query);
  }

  @Post('admin/phone-verifications/:id/verify')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60 * 1000 } })
  verifyManualPhoneVerification(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: VerifyManualPhoneVerificationDto,
  ) {
    return this.auth.verifyManualPhoneVerificationRequest(admin.sub, id, dto.code);
  }

  @Post('admin/phone-verifications/:id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  rejectManualPhoneVerification(@CurrentUser() admin: AccessTokenClaims, @Param('id') id: string) {
    return this.auth.rejectManualPhoneVerificationRequest(admin.sub, id);
  }

  @Get('admin/users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listUsers(
    @Query('role') role?: Role,
    @Query('status') status?: UserStatus,
    @Query('search') search?: string,
  ) {
    return this.auth.listUsers({ role, status, search });
  }

  // Admin audit queue: every trainer currently on an active automatic audit
  // hold (see AuthService.listAuditHoldUsers). Fixed segment must be
  // registered before the admin/users/:id/* routes below so Nest doesn't
  // try to match "audit-hold-queue" as a :id param.
  @Get('admin/users/audit-hold-queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listAuditHoldUsers() {
    return this.auth.listAuditHoldUsers();
  }

  @Patch('admin/users/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateUserRole(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    if (id === admin.sub && dto.role !== Role.ADMIN) {
      throw new BadRequestException('You cannot change your own role');
    }
    return this.auth.updateUserRole(id, dto.role);
  }

  @Patch('admin/users/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateUserStatus(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    if (id === admin.sub && dto.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('You cannot suspend or block your own account');
    }
    return this.auth.updateUserStatus(id, dto.status);
  }

  @Patch('admin/users/:id/trainer-rating')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateTrainerRating(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateTrainerRatingDto,
  ) {
    return this.auth.updateTrainerRating(admin.sub, id, dto.rating);
  }

  // Phase 2 of the Validator Dashboard (docs/validators.md): sets/changes a
  // validator's tier. Also sets role=VALIDATOR per the app-level invariant
  // (validatorLevel is only meaningful for that role) -- so this endpoint
  // both promotes/demotes an existing validator and onboards a non-validator
  // into the role in one call.
  @Patch('admin/users/:id/validator-level')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  updateValidatorLevel(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: UpdateValidatorLevelDto,
  ) {
    return this.auth.updateValidatorLevel(admin.sub, id, dto.validatorLevel);
  }

  @Get('admin/users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getAdminUser(@Param('id') id: string) {
    return this.auth.getAdminUser(id);
  }

  @Post('admin/users/:id/dialect/reset')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  resetUserDialect(@Param('id') id: string) {
    return this.auth.resetUserDialect(id);
  }

  @Get('admin/users/:id/activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getUserActivity(@Param('id') id: string, @Query() query: ListUserActivityDto) {
    return this.auth.getUserActivity(id, query);
  }

  // Kill switch, part 1: lock (SUSPENDED/BLOCKED), reversible via the plain
  // status route above. OTP-gated (when PlatformSettings.adminPayoutOtpEnabled
  // is on) because unlike a role change, this also rejects pending
  // withdrawals and cancels open P2P trades -- see AuthService.lockUser.
  @Post('admin/users/:id/lock/otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  requestUserLockOtp(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: LockUserDto,
  ) {
    return this.auth.requestUserLockOtp(admin.sub, id, dto.status);
  }

  @Post('admin/users/:id/lock')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  lockUser(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: LockUserDto,
  ) {
    return this.auth.lockUser(admin.sub, id, dto.status, dto.otpRequestId, dto.code);
  }

  // Kill switch, part 2: permanent delete. Always OTP-gated at the same
  // flag as lock/payouts -- see AuthService.deleteUser for why this
  // (deliberately) cannot be undone.
  @Post('admin/users/:id/delete/otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  requestUserDeleteOtp(@CurrentUser() admin: AccessTokenClaims, @Param('id') id: string) {
    return this.auth.requestUserDeleteOtp(admin.sub, id);
  }

  @Post('admin/users/:id/delete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  deleteUser(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: DeleteUserDto,
  ) {
    return this.auth.deleteUser(admin.sub, id, dto.otpRequestId, dto.code);
  }

  // Manual release of the automatic audit hold -- see
  // WordsService.createRecording (sets it) / AuthService.releaseAuditHold
  // (clears it). Distinct from lock/unlock: never touches `status`.
  @Post('admin/users/:id/audit-hold/release/otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  requestAuditHoldReleaseOtp(@CurrentUser() admin: AccessTokenClaims, @Param('id') id: string) {
    return this.auth.requestAuditHoldReleaseOtp(admin.sub, id);
  }

  @Post('admin/users/:id/audit-hold/release')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  releaseAuditHold(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: DeleteUserDto,
  ) {
    return this.auth.releaseAuditHold(admin.sub, id, dto.otpRequestId, dto.code);
  }

  // Admin-initiated revoke of a trainer's verified phone number -- forces
  // re-verification via OTP. Distinct from the manual-phone-verification
  // review routes above (those only ever move a request toward
  // verification); this undoes an existing one, so it follows the
  // conditionally-OTP-gated lock/audit-hold-release convention instead.
  @Post('admin/users/:id/phone/revoke/otp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  requestRevokePhoneOtp(@CurrentUser() admin: AccessTokenClaims, @Param('id') id: string) {
    return this.auth.requestRevokePhoneOtp(admin.sub, id);
  }

  @Post('admin/users/:id/phone/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  revokePhoneVerification(
    @CurrentUser() admin: AccessTokenClaims,
    @Param('id') id: string,
    @Body() dto: DeleteUserDto,
  ) {
    return this.auth.revokePhoneVerification(admin.sub, id, dto.otpRequestId, dto.code);
  }
}
