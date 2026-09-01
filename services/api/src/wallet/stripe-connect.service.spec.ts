import { BadGatewayException } from '@nestjs/common';
import { StripeConnectService } from './stripe-connect.service';

// Stripe's SDK opens real network handles from its constructor; unit tests
// must never construct a real client, so the whole module is mocked and
// each test wires up the specific resource method it needs. Mirrors how
// billing.service.spec.ts / subscription-plans.service.spec.ts already
// mock 'stripe' for the same reason.
const mockAccountsCreate = jest.fn();
const mockAccountsRetrieve = jest.fn();
const mockAccountLinksCreate = jest.fn();
const mockTransfersCreate = jest.fn();
const mockTransfersRetrieve = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    accounts: { create: mockAccountsCreate, retrieve: mockAccountsRetrieve },
    accountLinks: { create: mockAccountLinksCreate },
    transfers: { create: mockTransfersCreate, retrieve: mockTransfersRetrieve },
    webhooks: { constructEvent: mockWebhooksConstructEvent },
  }));
});

describe('StripeConnectService', () => {
  let service: StripeConnectService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StripeConnectService();
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  });

  describe('credential gating', () => {
    it('throws without calling Stripe when STRIPE_SECRET_KEY is not set', async () => {
      await expect(
        service.createConnectedAccount({ email: 'trainer@example.com', country: 'US' }),
      ).rejects.toThrow('STRIPE_SECRET_KEY is not set');
      expect(mockAccountsCreate).not.toHaveBeenCalled();
    });

    it('verifyWebhookSignature returns null (not throw) when STRIPE_CONNECT_WEBHOOK_SECRET is not set', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      const result = service.verifyWebhookSignature(Buffer.from('{}'), 'sig_header');
      expect(result).toBeNull();
      expect(mockWebhooksConstructEvent).not.toHaveBeenCalled();
    });
  });

  describe('createConnectedAccount', () => {
    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    });

    it('creates an Express account requesting transfers capability', async () => {
      mockAccountsCreate.mockResolvedValue({ id: 'acct_123' });

      const result = await service.createConnectedAccount({
        email: 'trainer@example.com',
        country: 'US',
      });

      expect(result).toEqual({ stripeAccountId: 'acct_123' });
      expect(mockAccountsCreate).toHaveBeenCalledWith({
        type: 'express',
        country: 'US',
        email: 'trainer@example.com',
        capabilities: { transfers: { requested: true } },
      });
    });

    it('wraps a provider failure in BadGatewayException', async () => {
      mockAccountsCreate.mockRejectedValue(new Error('stripe down'));

      await expect(
        service.createConnectedAccount({ email: 'trainer@example.com', country: 'US' }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('createOnboardingLink', () => {
    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    });

    it('returns the account link url', async () => {
      mockAccountLinksCreate.mockResolvedValue({ url: 'https://connect.stripe.com/setup/abc' });

      const result = await service.createOnboardingLink(
        'acct_123',
        'https://app.example.com/refresh',
        'https://app.example.com/return',
      );

      expect(result).toEqual({ url: 'https://connect.stripe.com/setup/abc' });
      expect(mockAccountLinksCreate).toHaveBeenCalledWith({
        account: 'acct_123',
        refresh_url: 'https://app.example.com/refresh',
        return_url: 'https://app.example.com/return',
        type: 'account_onboarding',
      });
    });
  });

  describe('getAccountStatus', () => {
    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    });

    it('maps Stripe account fields to the typed status result', async () => {
      mockAccountsRetrieve.mockResolvedValue({
        id: 'acct_123',
        details_submitted: true,
        payouts_enabled: false,
      });

      const result = await service.getAccountStatus('acct_123');

      expect(result.detailsSubmitted).toBe(true);
      expect(result.payoutsEnabled).toBe(false);
    });

    it('wraps a provider failure in BadGatewayException', async () => {
      mockAccountsRetrieve.mockRejectedValue(new Error('not found'));
      await expect(service.getAccountStatus('acct_123')).rejects.toThrow(BadGatewayException);
    });
  });

  describe('createTransfer', () => {
    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    });

    it('creates a transfer with a deterministic idempotency key derived from the reference', async () => {
      mockTransfersCreate.mockResolvedValue({ id: 'tr_123' });

      const result = await service.createTransfer({
        stripeAccountId: 'acct_123',
        amountUsdCents: 5000,
        reference: 'withdrawal-1',
        narration: 'Dialect Library trainer payout',
      });

      expect(result.transferId).toBe('tr_123');
      expect(result.status).toBe('transferred');
      expect(mockTransfersCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000,
          currency: 'usd',
          destination: 'acct_123',
          transfer_group: 'withdrawal-1',
        }),
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );

      // Same reference must always produce the same idempotency key so a
      // retry of the SAME withdrawal reuses the original transfer.
      await service.createTransfer({
        stripeAccountId: 'acct_123',
        amountUsdCents: 5000,
        reference: 'withdrawal-1',
        narration: 'Dialect Library trainer payout',
      });
      const [, firstOpts] = mockTransfersCreate.mock.calls[0];
      const [, secondOpts] = mockTransfersCreate.mock.calls[1];
      expect(firstOpts.idempotencyKey).toBe(secondOpts.idempotencyKey);
    });

    it('wraps a provider failure in BadGatewayException', async () => {
      mockTransfersCreate.mockRejectedValue(new Error('card declined'));

      await expect(
        service.createTransfer({
          stripeAccountId: 'acct_123',
          amountUsdCents: 5000,
          reference: 'withdrawal-1',
          narration: 'payout',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('getPayoutStatus', () => {
    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    });

    it('reports transferred when nothing has been reversed', async () => {
      mockTransfersRetrieve.mockResolvedValue({ id: 'tr_123', reversed: false, amount_reversed: 0 });

      const result = await service.getPayoutStatus('tr_123');
      expect(result).toEqual({ payoutId: 'tr_123', status: 'transferred', raw: expect.any(Object) });
    });

    it('reports reversed when the transfer has been reversed', async () => {
      mockTransfersRetrieve.mockResolvedValue({ id: 'tr_123', reversed: true, amount_reversed: 5000 });

      const result = await service.getPayoutStatus('tr_123');
      expect(result.status).toBe('reversed');
    });

    it('wraps a provider failure in BadGatewayException', async () => {
      mockTransfersRetrieve.mockRejectedValue(new Error('not found'));
      await expect(service.getPayoutStatus('tr_123')).rejects.toThrow(BadGatewayException);
    });
  });

  describe('verifyWebhookSignature', () => {
    beforeEach(() => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_123';
    });

    it('returns the constructed event on success', () => {
      const fakeEvent = { id: 'evt_123', type: 'transfer.reversed' };
      mockWebhooksConstructEvent.mockReturnValue(fakeEvent);

      const rawBody = Buffer.from('{"id":"evt_123"}');
      const result = service.verifyWebhookSignature(rawBody, 'sig_header');

      expect(result).toBe(fakeEvent);
      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(rawBody, 'sig_header', 'whsec_123');
    });

    it('returns null (not throw) when the signature header is missing', () => {
      const result = service.verifyWebhookSignature(Buffer.from('{}'), undefined);
      expect(result).toBeNull();
      expect(mockWebhooksConstructEvent).not.toHaveBeenCalled();
    });

    it('returns null (not throw) when the SDK rejects the signature', () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('signature mismatch');
      });

      const result = service.verifyWebhookSignature(Buffer.from('{}'), 'bad_sig');
      expect(result).toBeNull();
    });
  });
});
