import { createHmac } from 'crypto';
import { FlutterwaveV4Service } from './flutterwave-v4.service';

function mockTokenResponse(expiresIn = 600) {
  return {
    ok: true,
    text: async () =>
      JSON.stringify({ access_token: 'test-token', expires_in: expiresIn, token_type: 'Bearer' }),
  } as Response;
}

describe('FlutterwaveV4Service', () => {
  const webhookSecretHash = 'test-v4-webhook-secret-hash';
  let service: FlutterwaveV4Service;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.FLUTTERWAVE_V4_CLIENT_ID = 'test-client-id';
    process.env.FLUTTERWAVE_V4_CLIENT_SECRET = 'test-client-secret';
    process.env.FLUTTERWAVE_V4_BASE_URL = 'https://sandbox.example.com';
    process.env.FLUTTERWAVE_V4_WEBHOOK_SECRET_HASH = webhookSecretHash;
    service = new FlutterwaveV4Service();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.FLUTTERWAVE_V4_CLIENT_ID;
    delete process.env.FLUTTERWAVE_V4_CLIENT_SECRET;
    delete process.env.FLUTTERWAVE_V4_BASE_URL;
    delete process.env.FLUTTERWAVE_V4_WEBHOOK_SECRET_HASH;
  });

  describe('getAccessToken (via a public method that calls it)', () => {
    it('exchanges a token on first use and reuses it on a second call within the cache window', async () => {
      fetchSpy.mockResolvedValueOnce(mockTokenResponse());
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: { id: 'sdr_123' } }),
      } as Response);
      await service.createSender();
      const tokenCallsAfterFirst = fetchSpy.mock.calls.filter(
        (call) =>
          call[0] ===
          'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token',
      ).length;

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: { id: 'sdr_456' } }),
      } as Response);
      await service.createSender();
      const tokenCallsAfterSecond = fetchSpy.mock.calls.filter(
        (call) =>
          call[0] ===
          'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token',
      ).length;

      expect(tokenCallsAfterFirst).toBe(1);
      expect(tokenCallsAfterSecond).toBe(1); // no second token exchange -- cache hit
    });

    it('re-exchanges the token once the cached one is within the refresh buffer of expiry', async () => {
      fetchSpy.mockResolvedValueOnce(mockTokenResponse(30)); // expires in 30s, well inside the 60s buffer
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: { id: 'sdr_1' } }),
      } as Response);
      await service.createSender();

      fetchSpy.mockResolvedValueOnce(mockTokenResponse(600));
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: { id: 'sdr_2' } }),
      } as Response);
      await service.createSender();

      const tokenCalls = fetchSpy.mock.calls.filter(
        (call) =>
          call[0] ===
          'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token',
      ).length;
      expect(tokenCalls).toBe(2); // refreshed because the first token was inside the buffer
    });
  });

  describe('createRecipient', () => {
    beforeEach(() => {
      fetchSpy.mockResolvedValue(mockTokenResponse());
    });

    it('resolves bank_ngn for Nigeria and omits name (read-only for this type)', async () => {
      fetchSpy.mockResolvedValueOnce(mockTokenResponse());
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: { id: 'rcb_1' } }),
      } as Response);
      await service.createRecipient({
        type: 'bank',
        country: 'NG',
        bankCode: '044',
        accountNumber: '0000000000',
        firstName: 'Ada',
        lastName: 'Obi',
      });
      const recipientCall = fetchSpy.mock.calls.find((call) =>
        String(call[0]).endsWith('/transfers/recipients'),
      );
      const body = JSON.parse((recipientCall![1] as RequestInit).body as string);
      expect(body.type).toBe('bank_ngn');
      expect(body.name).toBeUndefined();
    });

    it('resolves bank_zar for South Africa and includes name.first/name.last', async () => {
      fetchSpy.mockResolvedValueOnce(mockTokenResponse());
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: { id: 'rcb_2' } }),
      } as Response);
      await service.createRecipient({
        type: 'bank',
        country: 'ZA',
        bankCode: '000',
        accountNumber: '0000000000',
        firstName: 'Ada',
        lastName: 'Obi',
      });
      const recipientCall = fetchSpy.mock.calls.find((call) =>
        String(call[0]).endsWith('/transfers/recipients'),
      );
      const body = JSON.parse((recipientCall![1] as RequestInit).body as string);
      expect(body.type).toBe('bank_zar');
      expect(body.name).toEqual({ first: 'Ada', last: 'Obi' });
    });

    it.each(['GH', 'KE', 'UG'] as const)(
      'refuses %s bank payouts (Flutterwave requires a bank branch this app does not collect)',
      async (country) => {
        await expect(
          service.createRecipient({
            type: 'bank',
            country,
            bankCode: '000',
            accountNumber: '0000000000',
            firstName: 'Ada',
            lastName: 'Obi',
          }),
        ).rejects.toThrow(/require a bank branch/);
      },
    );

    it('throws a clear error for an unmapped bank recipient country (Tanzania)', async () => {
      await expect(
        service.createRecipient({
          type: 'bank',
          country: 'TZ',
          bankCode: '000',
          accountNumber: '0000000000',
          firstName: 'Ada',
          lastName: 'Obi',
        }),
      ).rejects.toThrow(/does not support bank payouts for TZ/);
    });

    it('throws a clear error for an unmapped mobile money recipient country (Nigeria)', async () => {
      await expect(
        service.createRecipient({
          type: 'mobile_money',
          country: 'NG',
          network: 'MTN',
          phoneNumber: '08012345678',
          firstName: 'Ada',
          lastName: 'Obi',
        }),
      ).rejects.toThrow(/does not support mobile money payouts for NG/);
    });

    it('resolves the correct mobile money recipient type for Tanzania and includes name', async () => {
      fetchSpy.mockResolvedValueOnce(mockTokenResponse());
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: { id: 'rcb_3' } }),
      } as Response);
      await service.createRecipient({
        type: 'mobile_money',
        country: 'TZ',
        network: 'MTN',
        phoneNumber: '0700000000',
        firstName: 'Ada',
        lastName: 'Obi',
      });
      const recipientCall = fetchSpy.mock.calls.find((call) =>
        String(call[0]).endsWith('/transfers/recipients'),
      );
      const body = JSON.parse((recipientCall![1] as RequestInit).body as string);
      expect(body.type).toBe('mobile_money_tzs');
      expect(body.name).toEqual({ first: 'Ada', last: 'Obi' });
    });
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a matching HMAC-SHA256 flutterwave-signature header over the raw body', () => {
      const rawBody = Buffer.from(JSON.stringify({ type: 'charge.completed' }));
      const signature = createHmac('sha256', webhookSecretHash).update(rawBody).digest('base64');
      expect(service.verifyWebhookSignature(rawBody, { 'flutterwave-signature': signature })).toBe(
        true,
      );
    });

    it('rejects a mismatched flutterwave-signature header', () => {
      const rawBody = Buffer.from(JSON.stringify({ type: 'transfer.disburse' }));
      const wrongSignature = createHmac('sha256', 'wrong-secret').update(rawBody).digest('base64');
      expect(
        service.verifyWebhookSignature(rawBody, { 'flutterwave-signature': wrongSignature }),
      ).toBe(false);
    });

    it('rejects when the header is missing (v4 has no legacy verif-hash fallback)', () => {
      const rawBody = Buffer.from(JSON.stringify({ type: 'charge.completed' }));
      expect(service.verifyWebhookSignature(rawBody, {})).toBe(false);
    });

    it('is sensitive to raw body changes even with a valid HMAC key (tamper detection)', () => {
      const originalBody = Buffer.from(JSON.stringify({ amount: 100 }));
      const signature = createHmac('sha256', webhookSecretHash)
        .update(originalBody)
        .digest('base64');
      const tamperedBody = Buffer.from(JSON.stringify({ amount: 100000 }));
      expect(
        service.verifyWebhookSignature(tamperedBody, { 'flutterwave-signature': signature }),
      ).toBe(false);
    });
  });
});
