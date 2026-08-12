import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';
import { OtpService } from './otp.service';

@Module({
  imports: [MailModule, SmsModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
