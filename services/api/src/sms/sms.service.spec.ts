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

  it('sends transactional OTPs as the code only, using SMSLive247 first', async () => {
    platformSettings.getForAdmin.mockResolvedValue({
      smsProviderOrder: 'twilio,termii,africastalking',
      smsTransactionalOtpEnabled: true,
      smsTransactionalProviderOrder: 'smslive247,termii,twilio,africastalking',
    });
    const sendSpy = jest
      .spyOn((service as any).chain, 'send')
      .mockResolvedValue({ provider: 'twilio' });

    await service.sendOtp('+2348012345678', '123456');

    expect(sendSpy).toHaveBeenCalledWith(
      '+2348012345678',
      '123456',
      ['smslive247', 'termii', 'twilio', 'africastalking'],
      undefined,
    );
  });

  it('sendTransactional uses the transactional provider order (smsTransactionalProviderOrder), including smslive247', async () => {
    platformSettings.getForAdmin.mockResolvedValue({
      smsProviderOrder: 'termii,twilio,africastalking',
      smsTransactionalProviderOrder: 'smslive247,termii,twilio,africastalking',
    });
    const sendSpy = jest
      .spyOn((service as any).chain, 'send')
      .mockResolvedValue({ provider: 'smslive247' });

    await service.sendTransactional('+2348012345678', 'Your P2P trade has started.');

    expect(sendSpy).toHaveBeenCalledWith(
      '+2348012345678',
      'Your P2P trade has started.',
      ['smslive247', 'termii', 'twilio', 'africastalking'],
      undefined,
    );
  });

  it('sendTransactional forces a single provider with no fallback when an override is given', async () => {
    platformSettings.getForAdmin.mockResolvedValue({
      smsProviderOrder: 'termii,twilio,africastalking',
      smsTransactionalProviderOrder: 'smslive247,termii,twilio,africastalking',
    });
    const sendSpy = jest
      .spyOn((service as any).chain, 'send')
      .mockResolvedValue({ provider: 'twilio' });

    await service.sendTransactional('+2348012345678', 'Testing twilio directly.', 'twilio');

    expect(sendSpy).toHaveBeenCalledWith(
      '+2348012345678',
      'Testing twilio directly.',
      ['twilio'],
      undefined,
    );
  });

  it('passes the admin-configured smsSenderId through to the fallback chain', async () => {
    platformSettings.getForAdmin.mockResolvedValue({
      smsProviderOrder: 'termii,twilio,africastalking',
      smsTransactionalOtpEnabled: true,
      smsTransactionalProviderOrder: 'termii,twilio,africastalking,smslive247',
      smsSenderId: 'Dialect',
    });
    const sendSpy = jest
      .spyOn((service as any).chain, 'send')
      .mockResolvedValue({ provider: 'termii' });

    await service.sendOtp('+2348012345678', '123456');

    expect(sendSpy).toHaveBeenCalledWith(
      '+2348012345678',
      '123456',
      ['termii', 'twilio', 'africastalking', 'smslive247'],
      'Dialect',
    );
  });

  it('uses the legacy explanatory OTP path only when transactional OTP is disabled', async () => {
    platformSettings.getForAdmin.mockResolvedValue({
      smsProviderOrder: 'twilio,termii,africastalking',
      smsTransactionalOtpEnabled: false,
      smsTransactionalProviderOrder: 'smslive247,termii,twilio,africastalking',
    });
    const sendSpy = jest
      .spyOn((service as any).chain, 'send')
      .mockResolvedValue({ provider: 'twilio' });

    await service.sendOtp('+2348012345678', '123456');

    expect(sendSpy).toHaveBeenCalledWith(
      '+2348012345678',
      expect.stringContaining('123456'),
      ['twilio', 'termii', 'africastalking'],
      undefined,
    );
  });
});
