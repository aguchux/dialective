import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { WhatsAppValidatorController } from './whatsapp-validator.controller';
import { WhatsAppValidatorService } from './whatsapp-validator.service';

@Module({
  imports: [MailModule, IntegrationsModule],
  controllers: [WhatsAppValidatorController],
  providers: [WhatsAppValidatorService],
  exports: [WhatsAppValidatorService],
})
export class WhatsAppValidatorModule {}
