import { Injectable, Logger } from '@nestjs/common';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { MailerSendWhatsAppProvider } from './providers/mailersend-whatsapp.provider';
import { MetaWhatsAppProvider } from './providers/meta-whatsapp.provider';
import { WhatsappDeliveryException } from './whatsapp-delivery.exception';

/**
 * Thin injectable wrapper dispatching to whichever WhatsApp backend is
 * currently active (PlatformSettings.whatsappProvider: MailerSend or Meta's
 * WhatsApp Cloud API direct), reading admin-configured (DB-stored,
 * encrypted) credentials via PlatformSettingsService.getWhatsappConfig's
 * tagged union -- mirrors SmsService's constructor/wrapper pattern, but
 * there is no fallback chain between the two: exactly one provider is
 * active at a time, matching whatsappProvider's "one active backend" model.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly mailersend = new MailerSendWhatsAppProvider();
  private readonly metaDirect = new MetaWhatsAppProvider();

  constructor(private readonly platformSettings: PlatformSettingsService) {}

  /** True if WhatsApp OTP is enabled and the active provider is fully configured (see PlatformSettingsService.getWhatsappConfig) -- callers use this to decide whether to attempt sendOtp at all rather than catching a guaranteed failure. */
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
      if (config.provider === 'meta_direct') {
        await this.metaDirect.send(toE164, code, config);
      } else {
        await this.mailersend.send(toE164, code, config);
      }
    } catch (err) {
      this.logger.error(
        `WhatsApp send failed (provider=${config.provider}): ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new WhatsappDeliveryException();
    }
  }
}
