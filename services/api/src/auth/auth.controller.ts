import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { ConsumeMagicLinkDto } from './dto/consume-magic-link.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { OAuthCallbackGuard } from './guards/oauth-callback.guard';
import { JwtAuthGuard } from './strategies/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AccessTokenClaims } from './jwt.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.referralCode);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
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
    return this.auth.updateProfile(user.sub, dto.countryId, dto.dialectId);
  }
}
