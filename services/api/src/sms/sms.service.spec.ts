import { SmsService } from './sms.service';

describe('SmsService', () => {
  let platformSettings: any;
  let service: SmsService;

  beforeEach(() => {
    platformSettings = { getForAdmin: jest.fn() };
    service = new SmsService(platformSettings);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sendOtp uses the OTP provider order (smsProviderOrder), never smslive247', async () => {
    platformSettings.getForAdmin.mockResolvedValue({
      smsProviderOrder: 'twilio,termii,africastalking',
      smsTransactionalProviderOrder: 'termii,twilio,africastalking,smslive247',
    });
    const sendSpy = jest.spyOn((service as any).chain, 'send').mockResolvedValue({ provider: 'twilio' });

    await service.sendOtp('+2348012345678', '123456');

    expect(sendSpy).toHaveBeenCalledWith(
      '+2348012345678',
      expect.stringContaining('123456'),
      ['twilio', 'termii', 'africastalking'],
      undefined,
    );
  });

  it('sendTransactional uses the transactional provider order (smsTransactionalProviderOrder), including smslive247', async () => {
    platformSettings.getForAdmin.mockResolvedValue({
      smsProviderOrder: 'termii,twilio,africastalking',
      smsTransactionalProviderOrder: 'smslive247,termii,twilio,africastalking',
    });
    const sendSpy = jest.spyOn((service as any).chain, 'send').mockResolvedValue({ provider: 'smslive247' });

    await service.sendTransactional('+2348012345678', 'Your P2P trade has started.');

    expect(sendSpy).toHaveBeenCalledWith(
      '+2348012345678',
      'Your P2P trade has started.',
      ['smslive247', 'termii', 'twilio', 'africastalking'],
      undefined,
    );
  });

  it('passes the admin-configured smsSenderId through to the fallback chain', async () => {
    platformSettings.getForAdmin.mockResolvedValue({
      smsProviderOrder: 'termii,twilio,africastalking',
      smsTransactionalProviderOrder: 'termii,twilio,africastalking,smslive247',
      smsSenderId: 'Dialect',
    });
    const sendSpy = jest.spyOn((service as any).chain, 'send').mockResolvedValue({ provider: 'termii' });

    await service.sendOtp('+2348012345678', '123456');

    expect(sendSpy).toHaveBeenCalledWith(
      '+2348012345678',
      expect.stringContaining('123456'),
      ['termii', 'twilio', 'africastalking'],
      'Dialect',
    );
  });
});
