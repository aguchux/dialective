import { ChatDialectController } from './chatdialect.controller';

describe('ChatDialectController.getToken', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when LiveKit env vars are not configured', async () => {
    delete process.env.LIVEKIT_API_KEY;
    delete process.env.LIVEKIT_API_SECRET;
    delete process.env.LIVEKIT_URL;
    const controller = new ChatDialectController();

    await expect(controller.getToken()).rejects.toThrow('LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must all be set');
  });

  it('mints a token with a generated identity and the requested room', async () => {
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret-at-least-32-characters-long';
    process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
    const controller = new ChatDialectController();

    const result = await controller.getToken('my-room');

    expect(result.room).toBe('my-room');
    expect(result.url).toBe('wss://example.livekit.cloud');
    expect(result.identity).toMatch(/^guest-/);
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
  });

  it('defaults to the chatdialect-demo room when none is given', async () => {
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret-at-least-32-characters-long';
    process.env.LIVEKIT_URL = 'wss://example.livekit.cloud';
    const controller = new ChatDialectController();

    const result = await controller.getToken();

    expect(result.room).toBe('chatdialect-demo');
  });
});
