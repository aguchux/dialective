import { WhatsappService } from './whatsapp.service';
import { WhatsappDeliveryException } from './whatsapp-delivery.exception';

function setup(config: { apiKey: string; senderId: string; templateId: string } | null) {
  const platformSettings = { getWhatsappConfig: jest.fn().mockResolvedValue(config) };
  const service = new WhatsappService(platformSettings as never);
  return { service, platformSettings };
}

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

  it('sends via MailerSend when fully configured', async () => {
    const { service } = setup({ apiKey: 'key', senderId: '15550001234', templateId: 'otp_code' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' }) as never;

    await expect(service.sendOtp('+15551234567', '123456')).resolves.toBeUndefined();
  });

  it('wraps a provider failure as WhatsappDeliveryException, never the raw error', async () => {
    const { service } = setup({ apiKey: 'key', senderId: '15550001234', templateId: 'otp_code' });
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'server error' }) as never;

    await expect(service.sendOtp('+15551234567', '123456')).rejects.toBeInstanceOf(
      WhatsappDeliveryException,
    );
  });
});

describe('WhatsappService.isConfigured', () => {
  it('reflects PlatformSettingsService.getWhatsappConfig', async () => {
    const { service: configured } = setup({ apiKey: 'k', senderId: 's', templateId: 't' });
    await expect(configured.isConfigured()).resolves.toBe(true);

    const { service: unconfigured } = setup(null);
    await expect(unconfigured.isConfigured()).resolves.toBe(false);
  });
});
