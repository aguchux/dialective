import { Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module';
import { SettingsModule } from '../settings/settings.module';
import { SmsModule } from '../sms/sms.module';
import { P2PController } from './p2p.controller';
import { P2PService } from './p2p.service';

@Module({
  imports: [OtpModule, SettingsModule, SmsModule],
  controllers: [P2PController],
  providers: [P2PService],
})
export class P2PModule {}
