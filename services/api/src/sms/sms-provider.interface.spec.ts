import { parseSmsProviderOrder } from './sms-provider.interface';

describe('parseSmsProviderOrder', () => {
  it('parses a valid permutation', () => {
    expect(parseSmsProviderOrder('twilio,termii,africastalking,smslive247')).toEqual([
      'twilio',
      'termii',
      'africastalking',
      'smslive247',
    ]);
  });

  it('falls back to the default order for an invalid/incomplete list', () => {
    expect(parseSmsProviderOrder('twilio,termii,africastalking')).toEqual(['termii', 'twilio', 'africastalking', 'smslive247']);
    expect(parseSmsProviderOrder('twilio,twilio,termii,africastalking')).toEqual([
      'termii',
      'twilio',
      'africastalking',
      'smslive247',
    ]);
    expect(parseSmsProviderOrder('not,a,provider,at,all')).toEqual(['termii', 'twilio', 'africastalking', 'smslive247']);
  });
});
