import { createSmslive247Otp, verifySmslive247Otp } from './smslive247-native-otp';

describe('smslive247-native-otp', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SMSLIVE247_API_KEY = 'test-key';
    process.env.SMSLIVE247_SENDER_ID = 'golojan';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  describe('createSmslive247Otp', () => {
    it('posts to the tokens/sms endpoint and returns expiresAt on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'ignored-by-us', expiresAt: '2026-08-13T00:10:00.000Z' }),
      }) as any;

      const result = await createSmslive247Otp('+2348012345678');

      expect(result).toEqual({ expiresAt: '2026-08-13T00:10:00.000Z' });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.smslive247.com/api/v5/tokens/sms',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
          body: JSON.stringify({ phoneNumber: '2348012345678', senderID: 'golojan' }),
        }),
      );
    });

    it('throws when credentials are not set', async () => {
      delete process.env.SMSLIVE247_API_KEY;
      await expect(createSmslive247Otp('+2348012345678')).rejects.toThrow('SMSLive247 credentials not set');
    });

    it('throws on a non-2xx response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'bad request' }) as any;
      await expect(createSmslive247Otp('+2348012345678')).rejects.toThrow('SMSLive247 token-create failed: 422');
    });

    it('throws when the response is missing expiresAt', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'x' }) }) as any;
      await expect(createSmslive247Otp('+2348012345678')).rejects.toThrow('missing expiresAt');
    });
  });

  describe('verifySmslive247Otp', () => {
    it('sends a DELETE with the code and phone number, returns true on isValid', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: true, message: 'ok' }) }) as any;

      const result = await verifySmslive247Otp('+2348012345678', '123456');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.smslive247.com/api/v5/tokens',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ token: '123456', to: '2348012345678' }),
        }),
      );
    });

    it('returns false when isValid is false', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ isValid: false, message: 'expired' }) }) as any;
      expect(await verifySmslive247Otp('+2348012345678', '000000')).toBe(false);
    });

    it('throws on a non-2xx response', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' }) as any;
      await expect(verifySmslive247Otp('+2348012345678', '123456')).rejects.toThrow('SMSLive247 token-verify failed: 401');
    });
  });
});
