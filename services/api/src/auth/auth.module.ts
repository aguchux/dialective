import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailModule } from '../mail/mail.module';
import { OtpModule } from '../otp/otp.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [MailModule, OtpModule, SettingsModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
