import { OtpService } from './otp.service';
import { SmsDeliveryException } from '../sms/sms-delivery.exception';

function setup() {
  const prisma: any = {
    otpCode: {
      create: jest.fn().mockResolvedValue({ id: 'otp-1' }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
  const mail = { sendOtpEmail: jest.fn().mockResolvedValue(undefined) };
  const sms = { sendOtp: jest.fn() };
  const service = new OtpService(prisma, mail as never, sms as never);
  return { service, prisma, mail, sms };
}

describe('OtpService.issueForUser SMS-failure email fallback', () => {
  it('delivers via SMS without touching email when SMS succeeds', async () => {
    const { service, mail, sms } = setup();
    sms.sendOtp.mockResolvedValue(undefined);

    await service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'SMS');

    expect(sms.sendOtp).toHaveBeenCalledWith('+15551234567', expect.any(String));
    expect(mail.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('falls back to the user own email when every SMS provider fails', async () => {
    const { service, prisma, mail, sms } = setup();
    sms.sendOtp.mockRejectedValue(new SmsDeliveryException());
    prisma.user.findUnique.mockResolvedValue({ email: 'trainer@example.com' });

    await service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'SMS');

    expect(sms.sendOtp).toHaveBeenCalledWith('+15551234567', expect.any(String));
    expect(mail.sendOtpEmail).toHaveBeenCalledWith(
      'trainer@example.com',
      expect.any(String),
      'WITHDRAWAL',
    );
  });

  it('does not swallow a non-delivery error (e.g. a bug), never falls back for it', async () => {
    const { service, mail, sms } = setup();
    sms.sendOtp.mockRejectedValue(new Error('unexpected'));

    await expect(
      service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'SMS'),
    ).rejects.toThrow('unexpected');
    expect(mail.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('never calls SMS at all when channel is EMAIL', async () => {
    const { service, mail, sms } = setup();

    await service.issueForUser('user-1', 'WITHDRAWAL', 'trainer@example.com', null, 'EMAIL');

    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(mail.sendOtpEmail).toHaveBeenCalledWith(
      'trainer@example.com',
      expect.any(String),
      'WITHDRAWAL',
    );
  });
});

describe('OtpService.resend', () => {
  it('always uses SMS for PHONE_VERIFICATION, with no email fallback on failure', async () => {
    const { service, prisma, mail, sms } = setup();
    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp-1',
      userId: 'user-1',
      purpose: 'PHONE_VERIFICATION',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'trainer@example.com',
      phoneNumber: '+15551234567',
      phoneVerifiedAt: new Date(),
      twoFactorSmsEnabled: false,
    });
    sms.sendOtp.mockRejectedValue(new SmsDeliveryException());

    await expect(service.resend('otp-1', false)).rejects.toThrow(SmsDeliveryException);
    expect(mail.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('falls back to email for LOGIN when SMS 2FA is on but every SMS provider fails', async () => {
    const { service, prisma, mail, sms } = setup();
    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp-1',
      userId: 'user-1',
      purpose: 'LOGIN',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'trainer@example.com',
      phoneNumber: '+15551234567',
      phoneVerifiedAt: new Date(),
      twoFactorSmsEnabled: true,
    });
    sms.sendOtp.mockRejectedValue(new SmsDeliveryException());

    await service.resend('otp-1', false);

    expect(sms.sendOtp).toHaveBeenCalledWith('+15551234567', expect.any(String));
    expect(mail.sendOtpEmail).toHaveBeenCalledWith(
      'trainer@example.com',
      expect.any(String),
      'LOGIN',
    );
  });

  it('uses email directly for LOGIN when SMS 2FA is off, never touching SMS', async () => {
    const { service, prisma, mail, sms } = setup();
    prisma.otpCode.findUnique.mockResolvedValue({
      id: 'otp-1',
      userId: 'user-1',
      purpose: 'LOGIN',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'trainer@example.com',
      phoneNumber: null,
      phoneVerifiedAt: null,
      twoFactorSmsEnabled: false,
    });

    await service.resend('otp-1', false);

    expect(sms.sendOtp).not.toHaveBeenCalled();
    expect(mail.sendOtpEmail).toHaveBeenCalledWith(
      'trainer@example.com',
      expect.any(String),
      'LOGIN',
    );
  });
});
