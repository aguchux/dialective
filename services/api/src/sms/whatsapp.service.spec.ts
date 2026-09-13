import { WhatsappService } from './whatsapp.service';
import { WhatsappDeliveryException } from './whatsapp-delivery.exception';

type WhatsappConfig =
  | { provider: 'mailersend'; apiKey: string; senderId: string; templateId: string }
  | {
      provider: 'meta_direct';
      accessToken: string;
      phoneNumberId: string;
      templateName: string;
      templateLanguage: string;
    }
  | null;

function setup(config: WhatsappConfig) {
  const platformSettings = { getWhatsappConfig: jest.fn().mockResolvedValue(config) };
  const service = new WhatsappService(platformSettings as never);
  return { service, platformSettings };
}

const MAILERSEND_CONFIG: WhatsappConfig = {
  provider: 'mailersend',
  apiKey: 'key',
  senderId: '15550001234',
  templateId: 'otp_code',
};
const META_CONFIG: WhatsappConfig = {
  provider: 'meta_direct',
  accessToken: 'meta-token',
  phoneNumberId: '123456789',
  templateName: 'otp_code',
  templateLanguage: 'en_US',
};

describe('WhatsappService.sendOtp', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws WhatsappDeliveryException without attempting a send when not configured', async () => {
    const { service } = setup(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;

    await expect(service.sendOtp('+15551234567', '123456')).rejects.toBeInstanceOf(
      WhatsappDeliveryException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends via MailerSend when that provider is active', async () => {
    const { service } = setup(MAILERSEND_CONFIG);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as never;

    await expect(service.sendOtp('+15551234567', '123456')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.mailersend.com/v1/whatsapp/send',
      expect.anything(),
    );
  });

  it('wraps a MailerSend failure as WhatsappDeliveryException, never the raw error', async () => {
    const { service } = setup(MAILERSEND_CONFIG);
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }) as never;

    await expect(service.sendOtp('+15551234567', '123456')).rejects.toBeInstanceOf(
      WhatsappDeliveryException,
    );
  });

  it('sends via Meta direct when that provider is active', async () => {
    const { service } = setup(META_CONFIG);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as never;

    await expect(service.sendOtp('+15551234567', '123456')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/123456789/messages',
      expect.anything(),
    );
  });

  it('wraps a Meta direct failure as WhatsappDeliveryException, never the raw error', async () => {
    const { service } = setup(META_CONFIG);
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid token' }) as never;

    await expect(service.sendOtp('+15551234567', '123456')).rejects.toBeInstanceOf(
      WhatsappDeliveryException,
    );
  });
});

describe('WhatsappService.isConfigured', () => {
  it('reflects PlatformSettingsService.getWhatsappConfig regardless of which provider is active', async () => {
    const { service: mailersendConfigured } = setup(MAILERSEND_CONFIG);
    await expect(mailersendConfigured.isConfigured()).resolves.toBe(true);

    const { service: metaConfigured } = setup(META_CONFIG);
    await expect(metaConfigured.isConfigured()).resolves.toBe(true);

    const { service: unconfigured } = setup(null);
    await expect(unconfigured.isConfigured()).resolves.toBe(false);
  });
});
