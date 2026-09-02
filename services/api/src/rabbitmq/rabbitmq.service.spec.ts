import { RabbitMqService } from './rabbitmq.service';

const mockAssertQueue = jest.fn().mockResolvedValue({});
const mockSendToQueue = jest.fn().mockReturnValue(true);
const mockConsume = jest.fn().mockResolvedValue({});
const mockAck = jest.fn();
const mockNack = jest.fn();
const mockChannel = {
  assertQueue: mockAssertQueue,
  sendToQueue: mockSendToQueue,
  consume: mockConsume,
  ack: mockAck,
  nack: mockNack,
};
const mockConnection = {
  on: jest.fn(),
  createChannel: jest.fn().mockResolvedValue(mockChannel),
  close: jest.fn().mockResolvedValue(undefined),
};
const mockConnect = jest.fn().mockResolvedValue(mockConnection);

jest.mock('amqplib', () => ({ connect: (...args: unknown[]) => mockConnect(...args) }));

describe('RabbitMqService', () => {
  let service: RabbitMqService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RABBITMQ_USERNAME = 'test-user';
    process.env.RABBITMQ_PASSWORD = 'test-pass';
    service = new RabbitMqService();
  });

  afterEach(() => {
    delete process.env.RABBITMQ_USERNAME;
    delete process.env.RABBITMQ_PASSWORD;
  });

  it('throws without connecting when credentials are not set', async () => {
    delete process.env.RABBITMQ_USERNAME;
    await expect(service.publish('q', { a: 1 })).rejects.toThrow(
      'RABBITMQ_USERNAME/RABBITMQ_PASSWORD are not set',
    );
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('publish declares a durable queue and sends a persistent message', async () => {
    await service.publish('my-queue', { hello: 'world' });

    expect(mockAssertQueue).toHaveBeenCalledWith('my-queue', { durable: true });
    expect(mockSendToQueue).toHaveBeenCalledWith(
      'my-queue',
      Buffer.from(JSON.stringify({ hello: 'world' })),
      { persistent: true },
    );
  });

  it('reuses the same channel across calls (connects once)', async () => {
    await service.publish('q1', { a: 1 });
    await service.publish('q2', { b: 2 });

    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('consume acks the message when the handler succeeds', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    await service.consume('my-queue', handler);

    const onMessage = mockConsume.mock.calls[0][1] as (msg: unknown) => void;
    const fakeMessage = { content: Buffer.from('payload') };
    onMessage(fakeMessage);
    await Promise.resolve();
    await Promise.resolve();

    expect(handler).toHaveBeenCalledWith(fakeMessage.content);
    expect(mockAck).toHaveBeenCalledWith(fakeMessage);
  });

  it('consume nacks with requeue when the handler throws', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('boom'));
    await service.consume('my-queue', handler);

    const onMessage = mockConsume.mock.calls[0][1] as (msg: unknown) => void;
    const fakeMessage = { content: Buffer.from('payload') };
    onMessage(fakeMessage);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockNack).toHaveBeenCalledWith(fakeMessage, false, true);
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('smokeTest resolves once the published token is consumed back', async () => {
    let capturedHandler: ((msg: { content: Buffer }) => void) | undefined;
    mockConsume.mockImplementation((_queue: string, handler: (msg: unknown) => void) => {
      capturedHandler = handler as (msg: { content: Buffer }) => void;
      return Promise.resolve({});
    });
    mockSendToQueue.mockImplementation((_queue: string, content: Buffer) => {
      // Simulate the broker delivering the message straight back synchronously.
      capturedHandler?.({ content });
      return true;
    });

    const result = await service.smokeTest();

    expect(result.ok).toBe(true);
    expect(typeof result.roundTripMs).toBe('number');
  });
});
