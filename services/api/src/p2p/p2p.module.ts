import { Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module';
import { SettingsModule } from '../settings/settings.module';
import { SmsModule } from '../sms/sms.module';
import { StorageModule } from '../storage/storage.module';
import { P2PController } from './p2p.controller';
import { P2PService } from './p2p.service';
import { P2PChatService } from './p2p-chat.service';

@Module({
  imports: [OtpModule, SettingsModule, SmsModule, StorageModule],
  controllers: [P2PController],
  providers: [P2PService, P2PChatService],
  exports: [P2PService, P2PChatService],
})
export class P2PModule {}
