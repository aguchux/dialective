import { createHmac } from 'crypto';
import { lookup } from 'dns/promises';
import { WebhookEventType } from '@dialectiva/db';
import { WebhookDeliveryConsumerService } from './webhook-delivery-consumer.service';

jest.mock('dns/promises', () => ({ lookup: jest.fn() }));
const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

function setup() {
  const prisma = { webhookDeliveryLog: { create: jest.fn().mockResolvedValue({}) } };
  const streams = { consume: jest.fn().mockResolvedValue(undefined) };
  const subscriptions = {
    findActiveSubscribers: jest.fn(),
    getDecryptedSecret: jest.fn().mockResolvedValue('shhh-secret'),
  };
  const service = new WebhookDeliveryConsumerService(
    prisma as never,
    streams as never,
    subscriptions as never,
  );
  return { service, prisma, streams, subscriptions };
}

function message(overrides: Partial<Record<string, string>> = {}) {
  return {
    id: '1-0',
    data: {
      organization_id: 'org-1',
      event_type: WebhookEventType.DECK_CREATED,
      payload: JSON.stringify({ deck_id: 'deck-1' }),
      attempt: '1',
      ...overrides,
    },
  };
}

describe('WebhookDeliveryConsumerService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    mockLookup.mockResolvedValue([{ address: '203.0.113.5', family: 4 }] as never);
  });

  afterEach(() => jest.resetAllMocks());

  it('delivers only to subscriptions whose eventTypes includes the incoming event', async () => {
    const { service, subscriptions } = setup();
    subscriptions.findActiveSubscribers.mockResolvedValue([
      { id: 'sub-1', url: 'https://example.com/hook' },
    ]);
    fetchMock.mockResolvedValue({ status: 200 });

    // Access the private handler via the public consume-triggering path is
    // awkward to unit test directly -- call the internal handle method
    // through the same shape RedisStreamsService.consume would invoke it.
    await (service as unknown as { handle: (m: unknown) => Promise<void> }).handle(message());

    expect(subscriptions.findActiveSubscribers).toHaveBeenCalledWith('org-1', WebhookEventType.DECK_CREATED);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('computes the HMAC correctly against a known secret/payload', async () => {
    const { service, subscriptions } = setup();
    subscriptions.findActiveSubscribers.mockResolvedValue([
      { id: 'sub-1', url: 'https://example.com/hook' },
    ]);
    fetchMock.mockResolvedValue({ status: 200 });

    await (service as unknown as { handle: (m: unknown) => Promise<void> }).handle(message());

    const body = JSON.stringify({ deck_id: 'deck-1' });
    const expectedSignature = `sha256=${createHmac('sha256', 'shhh-secret').update(body).digest('hex')}`;
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['X-Dialectiva-Signature']).toBe(expectedSignature);
    expect(options.body).toBe(body);
  });

  it('writes a WebhookDeliveryLog row on success', async () => {
    const { service, prisma, subscriptions } = setup();
    subscriptions.findActiveSubscribers.mockResolvedValue([
      { id: 'sub-1', url: 'https://example.com/hook' },
    ]);
    fetchMock.mockResolvedValue({ status: 200 });

    await (service as unknown as { handle: (m: unknown) => Promise<void> }).handle(message());

    expect(prisma.webhookDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subscriptionId: 'sub-1', succeeded: true, resultCode: 200 }),
      }),
    );
  });

  it('writes a WebhookDeliveryLog row on failure and rethrows so the reclaim loop retries', async () => {
    const { service, prisma, subscriptions } = setup();
    subscriptions.findActiveSubscribers.mockResolvedValue([
      { id: 'sub-1', url: 'https://example.com/hook' },
    ]);
    fetchMock.mockResolvedValue({ status: 500 });

    await expect(
      (service as unknown as { handle: (m: unknown) => Promise<void> }).handle(message()),
    ).rejects.toThrow();

    expect(prisma.webhookDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subscriptionId: 'sub-1', succeeded: false, resultCode: 500 }),
      }),
    );
  });

  it('rethrows on a fetch exception (e.g. timeout/connection refused)', async () => {
    const { service, subscriptions } = setup();
    subscriptions.findActiveSubscribers.mockResolvedValue([
      { id: 'sub-1', url: 'https://example.com/hook' },
    ]);
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    await expect(
      (service as unknown as { handle: (m: unknown) => Promise<void> }).handle(message()),
    ).rejects.toThrow();
  });

  it('never persists the raw connect-error message (would be a port-scan oracle over delivery logs/CSV export)', async () => {
    const { service, prisma, subscriptions } = setup();
    subscriptions.findActiveSubscribers.mockResolvedValue([
      { id: 'sub-1', url: 'https://example.com/hook' },
    ]);
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    await expect(
      (service as unknown as { handle: (m: unknown) => Promise<void> }).handle(message()),
    ).rejects.toThrow();

    const [[call]] = prisma.webhookDeliveryLog.create.mock.calls;
    expect(call.data.errorMessage).not.toContain('10.0.0.5');
    expect(call.data.errorMessage).not.toContain('ECONNREFUSED');
  });

  it('blocks delivery and does not call fetch when the URL resolves to a private/internal address (SSRF/DNS-rebinding guard)', async () => {
    const { service, prisma, subscriptions } = setup();
    subscriptions.findActiveSubscribers.mockResolvedValue([
      { id: 'sub-1', url: 'https://rebinding.example.com/hook' },
    ]);
    mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);

    await expect(
      (service as unknown as { handle: (m: unknown) => Promise<void> }).handle(message()),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.webhookDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subscriptionId: 'sub-1', succeeded: false }),
      }),
    );
  });

  it('does not deliver when there are no active subscribers', async () => {
    const { service, subscriptions } = setup();
    subscriptions.findActiveSubscribers.mockResolvedValue([]);

    await (service as unknown as { handle: (m: unknown) => Promise<void> }).handle(message());

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
