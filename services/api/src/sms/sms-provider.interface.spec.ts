import { parseSmsProviderOrder, parseSmsTransactionalProviderOrder } from './sms-provider.interface';

describe('parseSmsProviderOrder', () => {
  it('parses a valid permutation', () => {
    expect(parseSmsProviderOrder('twilio,termii,africastalking')).toEqual(['twilio', 'termii', 'africastalking']);
  });

  it('falls back to the default order for an invalid/incomplete list', () => {
    expect(parseSmsProviderOrder('twilio,termii')).toEqual(['termii', 'twilio', 'africastalking']);
    expect(parseSmsProviderOrder('twilio,twilio,termii')).toEqual(['termii', 'twilio', 'africastalking']);
    expect(parseSmsProviderOrder('not,a,provider')).toEqual(['termii', 'twilio', 'africastalking']);
  });

  it('rejects smslive247 as a fallback-chain member -- their OTP-compliant route cannot fire-and-forget an arbitrary code', () => {
    expect(parseSmsProviderOrder('termii,twilio,smslive247')).toEqual(['termii', 'twilio', 'africastalking']);
    expect(parseSmsProviderOrder('termii,twilio,africastalking,smslive247')).toEqual(['termii', 'twilio', 'africastalking']);
  });
});

describe('parseSmsTransactionalProviderOrder', () => {
  it('parses a valid 4-provider permutation, including smslive247', () => {
    expect(parseSmsTransactionalProviderOrder('smslive247,termii,twilio,africastalking')).toEqual([
      'smslive247',
      'termii',
      'twilio',
      'africastalking',
    ]);
  });

  it('falls back to the default order for an invalid/incomplete list', () => {
    expect(parseSmsTransactionalProviderOrder('termii,twilio,africastalking')).toEqual([
      'termii',
      'twilio',
      'africastalking',
      'smslive247',
    ]);
    expect(parseSmsTransactionalProviderOrder('not,a,provider,at,all')).toEqual([
      'termii',
      'twilio',
      'africastalking',
      'smslive247',
    ]);
  });
});
