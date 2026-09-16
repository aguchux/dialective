import { OtpService } from './otp.service';
import { SmsDeliveryException } from '../sms/sms-delivery.exception';
import { WhatsappDeliveryException } from '../sms/whatsapp-delivery.exception';

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
  const whatsapp = { sendOtp: jest.fn(), isConfigured: jest.fn().mockResolvedValue(true) };
  const service = new OtpService(prisma, mail as never, sms as never, whatsapp as never);
  return { service, prisma, mail, sms, whatsapp };
}

describe('OtpService.issueForUser dual-channel delivery', () => {
  it('sends both SMS and email in parallel when channel is SMS', async () => {
    const { service, prisma, mail, sms } = setup();
    sms.sendOtp.mockResolvedValue(undefined);
    prisma.user.findUnique.mockResolvedValue({ email: 'trainer@example.com' });

    await service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'SMS');

    expect(sms.sendOtp).toHaveBeenCalledWith('+15551234567', expect.any(String));
    expect(mail.sendOtpEmail).toHaveBeenCalledWith(
      'trainer@example.com',
      expect.any(String),
      'WITHDRAWAL',
    );
  });

  it('still succeeds via email when every SMS provider fails', async () => {
    const { service, prisma, mail, sms } = setup();
    sms.sendOtp.mockRejectedValue(new SmsDeliveryException());
    prisma.user.findUnique.mockResolvedValue({ email: 'trainer@example.com' });

    await service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'SMS');

    expect(mail.sendOtpEmail).toHaveBeenCalledWith(
      'trainer@example.com',
      expect.any(String),
      'WITHDRAWAL',
    );
  });

  it('throws when both SMS and email delivery fail', async () => {
    const { service, prisma, mail, sms } = setup();
    sms.sendOtp.mockRejectedValue(new SmsDeliveryException());
    mail.sendOtpEmail.mockRejectedValue(new Error('smtp down'));
    prisma.user.findUnique.mockResolvedValue({ email: 'trainer@example.com' });

    await expect(
      service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'SMS'),
    ).rejects.toBeInstanceOf(SmsDeliveryException);
  });

  it('does not swallow a non-delivery SMS error (e.g. a bug)', async () => {
    const { service, prisma, sms } = setup();
    sms.sendOtp.mockRejectedValue(new Error('unexpected'));
    prisma.user.findUnique.mockResolvedValue({ email: 'trainer@example.com' });

    await expect(
      service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'SMS'),
    ).rejects.toThrow('unexpected');
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

  it('sends both WhatsApp and email in parallel when channel is WHATSAPP', async () => {
    const { service, prisma, mail, whatsapp } = setup();
    whatsapp.sendOtp.mockResolvedValue(undefined);
    prisma.user.findUnique.mockResolvedValue({ email: 'trainer@example.com' });

    await service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'WHATSAPP');

    expect(whatsapp.sendOtp).toHaveBeenCalledWith('+15551234567', expect.any(String));
    expect(mail.sendOtpEmail).toHaveBeenCalledWith(
      'trainer@example.com',
      expect.any(String),
      'WITHDRAWAL',
    );
  });

  it('still succeeds via email when WhatsApp delivery fails', async () => {
    const { service, prisma, mail, whatsapp } = setup();
    whatsapp.sendOtp.mockRejectedValue(new WhatsappDeliveryException());
    prisma.user.findUnique.mockResolvedValue({ email: 'trainer@example.com' });

    await service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'WHATSAPP');

    expect(mail.sendOtpEmail).toHaveBeenCalledWith(
      'trainer@example.com',
      expect.any(String),
      'WITHDRAWAL',
    );
  });

  it('throws when both WhatsApp and email delivery fail', async () => {
    const { service, prisma, mail, whatsapp } = setup();
    whatsapp.sendOtp.mockRejectedValue(new WhatsappDeliveryException());
    mail.sendOtpEmail.mockRejectedValue(new Error('smtp down'));
    prisma.user.findUnique.mockResolvedValue({ email: 'trainer@example.com' });

    await expect(
      service.issueForUser('user-1', 'WITHDRAWAL', '+15551234567', null, 'WHATSAPP'),
    ).rejects.toBeInstanceOf(WhatsappDeliveryException);
  });

  it('never dual-sends email for PHONE_VERIFICATION over SMS -- an emailed code cannot prove phone ownership', async () => {
    const { service, prisma, mail, sms } = setup();
    sms.sendOtp.mockResolvedValue(undefined);

    await service.issueForUser('user-1', 'PHONE_VERIFICATION', '+15551234567', null, 'SMS');

    expect(sms.sendOtp).toHaveBeenCalledWith('+15551234567', expect.any(String));
    expect(mail.sendOtpEmail).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('never dual-sends email for PHONE_VERIFICATION over WhatsApp either', async () => {
    const { service, mail, whatsapp } = setup();
    whatsapp.sendOtp.mockResolvedValue(undefined);

    await service.issueForUser('user-1', 'PHONE_VERIFICATION', '+15551234567', null, 'WHATSAPP');

    expect(whatsapp.sendOtp).toHaveBeenCalledWith('+15551234567', expect.any(String));
    expect(mail.sendOtpEmail).not.toHaveBeenCalled();
  });

  it('throws (does not fall back to email) when SMS fails for PHONE_VERIFICATION', async () => {
    const { service, mail, sms } = setup();
    sms.sendOtp.mockRejectedValue(new SmsDeliveryException());

    await expect(
      service.issueForUser('user-1', 'PHONE_VERIFICATION', '+15551234567', null, 'SMS'),
    ).rejects.toBeInstanceOf(SmsDeliveryException);
    expect(mail.sendOtpEmail).not.toHaveBeenCalled();
  });
});

describe('OtpService.resend', () => {
  it('always uses SMS only for PHONE_VERIFICATION, never email', async () => {
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

  it('dual-sends SMS and email for LOGIN when SMS 2FA is on', async () => {
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
    sms.sendOtp.mockResolvedValue(undefined);

    await service.resend('otp-1', false);

    expect(sms.sendOtp).toHaveBeenCalledWith('+15551234567', expect.any(String));
    expect(mail.sendOtpEmail).toHaveBeenCalledWith(
      'trainer@example.com',
      expect.any(String),
      'LOGIN',
    );
  });

  it('still delivers by email for LOGIN when SMS 2FA is on but every SMS provider fails', async () => {
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
