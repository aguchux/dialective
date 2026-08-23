import { createHmac } from 'crypto';
import { FlutterwaveService } from './flutterwave.service';

describe('FlutterwaveService', () => {
  const secretHash = 'test-webhook-secret-hash';
  let service: FlutterwaveService;

  beforeEach(() => {
    process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH = secretHash;
    service = new FlutterwaveService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.FLUTTERWAVE_SECRET_KEY;
    delete process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a matching legacy verif-hash header (plain compare)', () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.completed' }));
      expect(service.verifyWebhookSignature(rawBody, { 'verif-hash': secretHash })).toBe(true);
    });

    it('rejects a mismatched verif-hash header', () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.completed' }));
      expect(service.verifyWebhookSignature(rawBody, { 'verif-hash': 'wrong-hash' })).toBe(false);
    });

    it('accepts a matching HMAC-SHA256 flutterwave-signature header over the raw body', () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'transfer.completed' }));
      const signature = createHmac('sha256', secretHash).update(rawBody).digest('base64');
      expect(service.verifyWebhookSignature(rawBody, { 'flutterwave-signature': signature })).toBe(
        true,
      );
    });

    it('rejects a mismatched flutterwave-signature header', () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'transfer.completed' }));
      const wrongSignature = createHmac('sha256', 'wrong-secret').update(rawBody).digest('base64');
      expect(
        service.verifyWebhookSignature(rawBody, { 'flutterwave-signature': wrongSignature }),
      ).toBe(false);
    });

    it('rejects when neither header is present', () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.completed' }));
      expect(service.verifyWebhookSignature(rawBody, {})).toBe(false);
    });

    it('is sensitive to raw body changes even with a valid HMAC key (tamper detection)', () => {
      const originalBody = Buffer.from(JSON.stringify({ amount: 100 }));
      const signature = createHmac('sha256', secretHash).update(originalBody).digest('base64');
      const tamperedBody = Buffer.from(JSON.stringify({ amount: 100000 }));
      expect(
        service.verifyWebhookSignature(tamperedBody, { 'flutterwave-signature': signature }),
      ).toBe(false);
    });
  });

  describe('getWebhookEventHash', () => {
    it('produces the same hash for identical raw bytes', () => {
      const rawBody = Buffer.from('{"a":1}');
      expect(service.getWebhookEventHash(rawBody)).toBe(service.getWebhookEventHash(rawBody));
    });

    it('produces a different hash for different raw bytes', () => {
      expect(service.getWebhookEventHash(Buffer.from('{"a":1}'))).not.toBe(
        service.getWebhookEventHash(Buffer.from('{"a":2}')),
      );
    });
  });

  describe('createPayment', () => {
    it('does not call the provider when the secret key is unavailable', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');

      await expect(
        service.createPayment({
          amount: 1000,
          currency: 'NGN',
          txRef: 'deposit-1',
          redirectUrl: 'https://example.com/callback',
          customerEmail: 'trainer@example.com',
        }),
      ).rejects.toThrow('FLUTTERWAVE_SECRET_KEY is not set');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns the hosted checkout link on success', async () => {
      process.env.FLUTTERWAVE_SECRET_KEY = 'FLWSECK_TEST-example';
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ status: 'success', data: { link: 'https://checkout.example' } }),
          {
            status: 200,
          },
        ),
      );

      await expect(
        service.createPayment({
          amount: 1000,
          currency: 'NGN',
          txRef: 'deposit-1',
          redirectUrl: 'https://example.com/callback',
          customerEmail: 'trainer@example.com',
        }),
      ).resolves.toEqual({ link: 'https://checkout.example' });
    });
  });

  describe('resolveAccount', () => {
    it('returns the resolved account name', async () => {
      process.env.FLUTTERWAVE_SECRET_KEY = 'FLWSECK_TEST-example';
      jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'success',
            data: { account_number: '0690000032', account_name: 'John Doe' },
          }),
          { status: 200 },
        ),
      );

      await expect(
        service.resolveAccount({ accountBank: '044', accountNumber: '0690000032' }),
      ).resolves.toEqual({ accountNumber: '0690000032', accountName: 'John Doe' });
    });
  });
});
