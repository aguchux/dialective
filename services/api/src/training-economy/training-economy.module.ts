import { Module } from '@nestjs/common';
import { OtpModule } from '../otp/otp.module';
import { TrainingEconomyController } from './training-economy.controller';
import { TrainingEconomyStepUpService } from './training-economy-step-up.service';

/**
 * A leaf module, deliberately.
 *
 * SettingsModule is @Global and must not import OtpModule -- OtpModule pulls
 * in MailModule and SmsModule, both of which import SettingsModule, so the
 * import closes a cycle that crash-loops the API at boot. Holding the OTP
 * dependency here keeps the flow into SettingsModule one-way.
 *
 * PlatformSettingsService is injected via @Global, not imported.
 */
@Module({
  imports: [OtpModule],
  controllers: [TrainingEconomyController],
  providers: [TrainingEconomyStepUpService],
  exports: [TrainingEconomyStepUpService],
})
export class TrainingEconomyModule {}
