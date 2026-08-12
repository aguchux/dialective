import { parseSmsProviderOrder } from './sms-provider.interface';

describe('parseSmsProviderOrder', () => {
  it('parses a valid permutation', () => {
    expect(parseSmsProviderOrder('twilio,termii,africastalking')).toEqual(['twilio', 'termii', 'africastalking']);
  });

  it('falls back to the default order for an invalid/incomplete list', () => {
    expect(parseSmsProviderOrder('twilio,termii')).toEqual(['termii', 'twilio', 'africastalking']);
    expect(parseSmsProviderOrder('twilio,twilio,termii')).toEqual(['termii', 'twilio', 'africastalking']);
    expect(parseSmsProviderOrder('not,a,provider')).toEqual(['termii', 'twilio', 'africastalking']);
  });
});
