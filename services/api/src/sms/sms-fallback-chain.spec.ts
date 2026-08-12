import { SmsFallbackChain } from './sms-fallback-chain';
import { SmsProvider, SmsProviderKey } from './sms-provider.interface';

function fakeProvider(key: SmsProviderKey, impl: () => Promise<void>): SmsProvider {
  return { key, send: jest.fn(impl) };
}

describe('SmsFallbackChain', () => {
  it('uses the first provider when it succeeds, never calling the others', async () => {
    const termii = fakeProvider('termii', async () => {});
    const twilio = fakeProvider('twilio', async () => {});
    const africastalking = fakeProvider('africastalking', async () => {});
    const chain = new SmsFallbackChain({ termii, twilio, africastalking });

    const result = await chain.send('+2348012345678', 'code 123456', ['termii', 'twilio', 'africastalking']);

    expect(result).toEqual({ provider: 'termii' });
    expect(termii.send).toHaveBeenCalledTimes(1);
    expect(twilio.send).not.toHaveBeenCalled();
    expect(africastalking.send).not.toHaveBeenCalled();
  });

  it('falls back to the second provider when the first throws, never calling the third', async () => {
    const termii = fakeProvider('termii', async () => {
      throw new Error('not configured');
    });
    const twilio = fakeProvider('twilio', async () => {});
    const africastalking = fakeProvider('africastalking', async () => {});
    const chain = new SmsFallbackChain({ termii, twilio, africastalking });

    const result = await chain.send('+2348012345678', 'code', ['termii', 'twilio', 'africastalking']);

    expect(result).toEqual({ provider: 'twilio' });
    expect(termii.send).toHaveBeenCalledTimes(1);
    expect(twilio.send).toHaveBeenCalledTimes(1);
    expect(africastalking.send).not.toHaveBeenCalled();
  });

  it('throws a combined error when every provider fails', async () => {
    const termii = fakeProvider('termii', async () => {
      throw new Error('bad key');
    });
    const twilio = fakeProvider('twilio', async () => {
      throw new Error('timeout');
    });
    const africastalking = fakeProvider('africastalking', async () => {
      throw new Error('unauthorized');
    });
    const chain = new SmsFallbackChain({ termii, twilio, africastalking });

    await expect(chain.send('+2348012345678', 'code', ['termii', 'twilio', 'africastalking'])).rejects.toThrow(
      /termii: bad key.*twilio: timeout.*africastalking: unauthorized/s,
    );
  });

  it('respects a custom (non-default) provider order', async () => {
    const termii = fakeProvider('termii', async () => {});
    const twilio = fakeProvider('twilio', async () => {});
    const africastalking = fakeProvider('africastalking', async () => {});
    const chain = new SmsFallbackChain({ termii, twilio, africastalking });

    const result = await chain.send('+2348012345678', 'code', ['africastalking', 'termii', 'twilio']);

    expect(result).toEqual({ provider: 'africastalking' });
    expect(termii.send).not.toHaveBeenCalled();
    expect(twilio.send).not.toHaveBeenCalled();
  });
});
