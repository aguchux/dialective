import { Injectable, Logger } from '@nestjs/common';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { MailerSendWhatsAppProvider } from './providers/mailersend-whatsapp.provider';
import { WhatsappDeliveryException } from './whatsapp-delivery.exception';

/**
 * Thin injectable wrapper around MailerSendWhatsAppProvider, reading the
 * admin-configured (DB-stored, encrypted) API key/sender/template from
 * PlatformSettings -- mirrors SmsService's constructor/wrapper pattern, but
 * there is exactly one provider (no fallback chain), since MailerSend is the
 * only WhatsApp integration this platform has.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly provider = new MailerSendWhatsAppProvider();

  constructor(private readonly platformSettings: PlatformSettingsService) {}

  /** True if WhatsApp OTP is enabled and fully configured (see PlatformSettingsService.getWhatsappConfig) -- callers use this to decide whether to attempt sendOtp at all rather than catching a guaranteed failure. */
  async isConfigured(): Promise<boolean> {
    return (await this.platformSettings.getWhatsappConfig()) !== null;
  }

  /**
   * Throws WhatsappDeliveryException (never the raw provider error) so
   * callers can treat "WhatsApp failed" uniformly, same posture as
   * SmsFallbackChain's SmsDeliveryException.
   */
  async sendOtp(toE164: string, code: string): Promise<void> {
    const config = await this.platformSettings.getWhatsappConfig();
    if (!config) {
      throw new WhatsappDeliveryException();
    }
    try {
      await this.provider.send(toE164, code, config);
    } catch (err) {
      this.logger.error(`MailerSend WhatsApp send failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new WhatsappDeliveryException();
    }
  }
}
