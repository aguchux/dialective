import { BadGatewayException } from '@nestjs/common';
import { StripeConnectService } from './stripe-connect.service';
import { ApiAccessTokensService } from '../api-access-tokens/api-access-tokens.service';

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
  let getDecrypted: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getDecrypted = jest.fn();
    const apiAccessTokens = { getDecrypted } as unknown as ApiAccessTokensService;
    service = new StripeConnectService(apiAccessTokens);
  });

  describe('credential gating', () => {
    it('throws without calling Stripe when stripe_secret_key is not configured', async () => {
      getDecrypted.mockResolvedValue(null);
      await expect(
        service.createConnectedAccount({ email: 'trainer@example.com', country: 'US' }),
      ).rejects.toThrow('stripe_secret_key API access token is not configured');
      expect(mockAccountsCreate).not.toHaveBeenCalled();
    });

    it('verifyWebhookSignature returns null (not throw) when stripe_connect_webhook_secret is not configured', async () => {
      getDecrypted.mockImplementation((key: string) =>
        key === 'stripe_secret_key' ? Promise.resolve('sk_test_123') : Promise.resolve(null),
      );
      const result = await service.verifyWebhookSignature(Buffer.from('{}'), 'sig_header');
      expect(result).toBeNull();
      expect(mockWebhooksConstructEvent).not.toHaveBeenCalled();
    });
  });

  describe('createConnectedAccount', () => {
    beforeEach(() => {
      getDecrypted.mockResolvedValue('sk_test_123');
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
      getDecrypted.mockResolvedValue('sk_test_123');
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
      getDecrypted.mockResolvedValue('sk_test_123');
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
      getDecrypted.mockResolvedValue('sk_test_123');
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
      getDecrypted.mockResolvedValue('sk_test_123');
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
      getDecrypted.mockImplementation((key: string) => {
        if (key === 'stripe_secret_key') return Promise.resolve('sk_test_123');
        if (key === 'stripe_connect_webhook_secret') return Promise.resolve('whsec_123');
        return Promise.resolve(null);
      });
    });

    it('returns the constructed event on success', async () => {
      const fakeEvent = { id: 'evt_123', type: 'transfer.reversed' };
      mockWebhooksConstructEvent.mockReturnValue(fakeEvent);

      const rawBody = Buffer.from('{"id":"evt_123"}');
      const result = await service.verifyWebhookSignature(rawBody, 'sig_header');

      expect(result).toBe(fakeEvent);
      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(rawBody, 'sig_header', 'whsec_123');
    });

    it('returns null (not throw) when the signature header is missing', async () => {
      const result = await service.verifyWebhookSignature(Buffer.from('{}'), undefined);
      expect(result).toBeNull();
      expect(mockWebhooksConstructEvent).not.toHaveBeenCalled();
    });

    it('returns null (not throw) when the SDK rejects the signature', async () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('signature mismatch');
      });

      const result = await service.verifyWebhookSignature(Buffer.from('{}'), 'bad_sig');
      expect(result).toBeNull();
    });
  });
});
