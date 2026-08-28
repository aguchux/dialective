import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailModule } from '../mail/mail.module';
import { OtpModule } from '../otp/otp.module';
import { SettingsModule } from '../settings/settings.module';
import { P2PModule } from '../p2p/p2p.module';
import { StorageModule } from '../storage/storage.module';
import { TokenomicsModule } from '../tokenomics/tokenomics.module';
import { RegisterRateLimitGuard } from '../common/guards/register-rate-limit.guard';

@Module({
  imports: [MailModule, OtpModule, SettingsModule, P2PModule, StorageModule, TokenomicsModule],
  controllers: [AuthController],
  providers: [AuthService, RegisterRateLimitGuard],
  exports: [AuthService],
})
export class AuthModule {}
