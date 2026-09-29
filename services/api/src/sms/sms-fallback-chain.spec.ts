import { SmsFallbackChain } from './sms-fallback-chain';
import { SmsProvider, SmsProviderKey } from './sms-provider.interface';

function fakeProvider(key: SmsProviderKey, impl: () => Promise<void>): SmsProvider {
  return { key, send: jest.fn(impl) };
}

function noop(): Promise<void> {
  return Promise.resolve();
}

describe('SmsFallbackChain', () => {
  it('uses the first provider when it succeeds, never calling the others', async () => {
    const termii = fakeProvider('termii', noop);
    const twilio = fakeProvider('twilio', noop);
    const africastalking = fakeProvider('africastalking', noop);
    const smslive247 = fakeProvider('smslive247', noop);
    const chain = new SmsFallbackChain({ termii, twilio, africastalking, smslive247 });

    const result = await chain.send('+2348012345678', 'code 123456', [
      'termii',
      'twilio',
      'africastalking',
      'smslive247',
    ]);

    expect(result).toEqual({ provider: 'termii' });
    expect(termii.send).toHaveBeenCalledTimes(1);
    expect(twilio.send).not.toHaveBeenCalled();
    expect(africastalking.send).not.toHaveBeenCalled();
    expect(smslive247.send).not.toHaveBeenCalled();
  });

  it('falls back to the second provider when the first throws, never calling the rest', async () => {
    const termii = fakeProvider('termii', async () => {
      throw new Error('not configured');
    });
    const twilio = fakeProvider('twilio', noop);
    const africastalking = fakeProvider('africastalking', noop);
    const smslive247 = fakeProvider('smslive247', noop);
    const chain = new SmsFallbackChain({ termii, twilio, africastalking, smslive247 });

    const result = await chain.send('+2348012345678', 'code', [
      'termii',
      'twilio',
      'africastalking',
      'smslive247',
    ]);

    expect(result).toEqual({ provider: 'twilio' });
    expect(termii.send).toHaveBeenCalledTimes(1);
    expect(twilio.send).toHaveBeenCalledTimes(1);
    expect(africastalking.send).not.toHaveBeenCalled();
    expect(smslive247.send).not.toHaveBeenCalled();
  });

  it('falls through to the fourth provider when the first three all fail', async () => {
    const termii = fakeProvider('termii', async () => {
      throw new Error('bad key');
    });
    const twilio = fakeProvider('twilio', async () => {
      throw new Error('timeout');
    });
    const africastalking = fakeProvider('africastalking', async () => {
      throw new Error('unauthorized');
    });
    const smslive247 = fakeProvider('smslive247', noop);
    const chain = new SmsFallbackChain({ termii, twilio, africastalking, smslive247 });

    const result = await chain.send('+2348012345678', 'code', [
      'termii',
      'twilio',
      'africastalking',
      'smslive247',
    ]);

    expect(result).toEqual({ provider: 'smslive247' });
    expect(smslive247.send).toHaveBeenCalledTimes(1);
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
    const smslive247 = fakeProvider('smslive247', async () => {
      throw new Error('invalid sender id');
    });
    const chain = new SmsFallbackChain({ termii, twilio, africastalking, smslive247 });

    await expect(
      chain.send('+2348012345678', 'code', ['termii', 'twilio', 'africastalking', 'smslive247']),
    ).rejects.toThrow('SMS delivery is temporarily unavailable');
  });

  it('respects a custom (non-default) provider order', async () => {
    const termii = fakeProvider('termii', noop);
    const twilio = fakeProvider('twilio', noop);
    const africastalking = fakeProvider('africastalking', noop);
    const smslive247 = fakeProvider('smslive247', noop);
    const chain = new SmsFallbackChain({ termii, twilio, africastalking, smslive247 });

    const result = await chain.send('+2348012345678', 'code', [
      'africastalking',
      'termii',
      'twilio',
      'smslive247',
    ]);

    expect(result).toEqual({ provider: 'africastalking' });
    expect(termii.send).not.toHaveBeenCalled();
    expect(twilio.send).not.toHaveBeenCalled();
    expect(smslive247.send).not.toHaveBeenCalled();
  });

  // Regression: SMSLive247 returned 400 "Only one phone number should be
  // included" in production because User.phoneNumber is validated but never
  // normalised, so a number typed with spaces reached the provider intact
  // and read as a delimited list.
  it('strips spaces and punctuation from the destination before sending', async () => {
    const termii = fakeProvider('termii', noop);
    const chain = new SmsFallbackChain({
      termii,
      twilio: fakeProvider('twilio', noop),
      africastalking: fakeProvider('africastalking', noop),
      smslive247: fakeProvider('smslive247', noop),
    });

    await chain.send('+27 82 123-4567', 'code 123456', ['termii']);

    expect(termii.send).toHaveBeenCalledWith('+27821234567', 'code 123456', undefined);
  });

  it('keeps the leading + and every digit intact', async () => {
    const termii = fakeProvider('termii', noop);
    const chain = new SmsFallbackChain({
      termii,
      twilio: fakeProvider('twilio', noop),
      africastalking: fakeProvider('africastalking', noop),
      smslive247: fakeProvider('smslive247', noop),
    });

    await chain.send('+234 (801) 234.5678', 'body', ['termii']);

    expect(termii.send).toHaveBeenCalledWith('+2348012345678', 'body', undefined);
  });

  it('passes an already-clean E.164 number through unchanged', async () => {
    const termii = fakeProvider('termii', noop);
    const chain = new SmsFallbackChain({
      termii,
      twilio: fakeProvider('twilio', noop),
      africastalking: fakeProvider('africastalking', noop),
      smslive247: fakeProvider('smslive247', noop),
    });

    await chain.send('+2348012345678', 'body', ['termii']);

    expect(termii.send).toHaveBeenCalledWith('+2348012345678', 'body', undefined);
  });

  it('normalises for every provider in the order, not just the first', async () => {
    const termii = fakeProvider('termii', async () => {
      throw new Error('down');
    });
    const twilio = fakeProvider('twilio', noop);
    const chain = new SmsFallbackChain({
      termii,
      twilio,
      africastalking: fakeProvider('africastalking', noop),
      smslive247: fakeProvider('smslive247', noop),
    });

    await chain.send('+27 82 123 4567', 'body', ['termii', 'twilio']);

    expect(termii.send).toHaveBeenCalledWith('+27821234567', 'body', undefined);
    expect(twilio.send).toHaveBeenCalledWith('+27821234567', 'body', undefined);
  });
});
