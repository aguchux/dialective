const sendMock = jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import { MailService } from './mail.service';

describe('MailService.sendWeeklyTrainerReportEmail', () => {
  let settings: any;
  let prisma: any;
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = { getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com') };
    // MailService now writes an EmailSendLog row per attempt and reads the
    // recipient's emailNotificationsEnabled for optional mail.
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      emailSendLog: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new MailService(settings as never, prisma as never);
  });

  it('sends the weekly report with the recordings/score/earnings summary and an escaped first name', async () => {
    await service.sendWeeklyTrainerReportEmail({
      trainerEmail: 'trainer@example.com',
      trainerFirstName: '<b>Ada</b>',
      recordings: 12,
      avgScore: '84.50',
      totalEarningsTokens: '3.5',
      daily: [
        { date: '2026-08-24', recordings: 2 },
        { date: '2026-08-25', recordings: 10 },
      ],
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('trainer@example.com');
    expect(call.from).toBe('noreply@example.com');
    expect(call.subject).toContain('weekly');
    expect(call.html).toContain('12');
    expect(call.html).toContain('84.50');
    expect(call.html).toContain('3.5 DL');
    expect(call.html).not.toContain('<b>Ada</b>');
    expect(call.html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(call.html).toContain('/dashboard/reports');
  });

  it('falls back to "there" when the trainer has no first name on file', async () => {
    await service.sendWeeklyTrainerReportEmail({
      trainerEmail: 'trainer@example.com',
      trainerFirstName: null,
      recordings: 0,
      avgScore: null,
      totalEarningsTokens: '0',
      daily: [],
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.html).toContain('Hi there');
    expect(call.text).toContain('Hi there');
  });
});

describe('MailService.sendTrainerReportPdfEmail', () => {
  let settings: any;
  let prisma: any;
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = { getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com') };
    // MailService now writes an EmailSendLog row per attempt and reads the
    // recipient's emailNotificationsEnabled for optional mail.
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      emailSendLog: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new MailService(settings as never, prisma as never);
  });

  it('sends the PDF as an attachment with an escaped first name', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake pdf bytes');

    await service.sendTrainerReportPdfEmail({
      trainerEmail: 'trainer@example.com',
      trainerFirstName: '<b>Ada</b>',
      pdf,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('trainer@example.com');
    expect(call.subject).toContain('PDF');
    expect(call.html).not.toContain('<b>Ada</b>');
    expect(call.html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(call.attachments).toEqual([
      { filename: 'dialect-library-report.pdf', content: pdf, contentType: 'application/pdf' },
    ]);
  });

  it('falls back to "there" when the trainer has no first name on file', async () => {
    await service.sendTrainerReportPdfEmail({
      trainerEmail: 'trainer@example.com',
      trainerFirstName: null,
      pdf: Buffer.from('pdf'),
    });

    const call = sendMock.mock.calls[0][0];
    expect(call.html).toContain('Hi there');
    expect(call.text).toContain('Hi there');
  });
});

describe('MailService.sendOtpEmail PAYOUT_ACCOUNT_DELETE', () => {
  let settings: any;
  let prisma: any;
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = { getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com') };
    // MailService now writes an EmailSendLog row per attempt and reads the
    // recipient's emailNotificationsEnabled for optional mail.
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      emailSendLog: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new MailService(settings as never, prisma as never);
  });

  it('sends a deletion-confirmation email containing the code', async () => {
    await service.sendOtpEmail('trainer@example.com', '654321', 'PAYOUT_ACCOUNT_DELETE' as never);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('trainer@example.com');
    expect(call.subject).toContain('deletion');
    expect(call.html).toContain('654321');
    expect(call.text).toContain('654321');
  });
});

describe('MailService.sendOtpEmail PAYOUT_ACCOUNT_SETUP', () => {
  let settings: any;
  let prisma: any;
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = { getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com') };
    // MailService now writes an EmailSendLog row per attempt and reads the
    // recipient's emailNotificationsEnabled for optional mail.
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      emailSendLog: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new MailService(settings as never, prisma as never);
  });

  it('sends a wallet-setup-confirmation email containing the code', async () => {
    await service.sendOtpEmail('trainer@example.com', '111222', 'PAYOUT_ACCOUNT_SETUP' as never);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('trainer@example.com');
    expect(call.subject).toContain('wallet');
    expect(call.html).toContain('111222');
    expect(call.text).toContain('111222');
  });
});

describe('MailService.sendSupportRequestNotification', () => {
  let settings: any;
  let prisma: any;
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = {
      getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com'),
      getLeadsNotificationAddress: jest.fn().mockResolvedValue('support@example.com'),
    };
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      emailSendLog: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new MailService(settings as never, prisma as never);
  });

  it('emails the leads-notification address with the request details, escaping HTML in the message', async () => {
    await service.sendSupportRequestNotification({
      id: 'req-1',
      name: 'Ada <script>',
      email: 'ada@example.com',
      subject: 'Cannot withdraw',
      message: 'Line one\nLine two',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe('support@example.com');
    expect(call.from).toBe('noreply@example.com');
    expect(call.subject).toContain('Cannot withdraw');
    expect(call.html).toContain('ada@example.com');
    expect(call.html).not.toContain('<script>');
    expect(call.html).toContain('Line one<br>Line two');
    expect(call.text).toContain('Line one\nLine two');
  });
});

/**
 * Preference gating + audit logging.
 *
 * emailNotificationsEnabled had existed on User, been editable in the
 * profile, and been read by nothing -- 12 users had explicitly opted out
 * and were still receiving every email. These pin the two halves of the
 * fix, and in particular that the gate CANNOT reach security mail: a user
 * who cannot log in has not opted out of a password reset.
 */
describe('MailService -- preference gating and send logging', () => {
  let settings: any;
  let prisma: any;
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = { getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com') };
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      emailSendLog: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new MailService(settings as never, prisma as never);
  });

  it('suppresses optional mail for a user who opted out, and records why', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', emailNotificationsEnabled: false });

    await service.sendReferralInviteEmail({
      inviterName: 'Ada',
      inviterEmail: 'ada@example.com',
      inviteeFirstName: 'Bo',
      inviteeEmail: 'bo@example.com',
      referralUrl: 'https://example.com/r/abc',
    });

    expect(sendMock).not.toHaveBeenCalled();
    expect(prisma.emailSendLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sent: false, suppressedReason: 'USER_OPTED_OUT' }),
      }),
    );
  });

  it('still delivers a password reset to a user who opted out', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', emailNotificationsEnabled: false });

    await service.sendPasswordResetEmail('bo@example.com', 'tok');

    // Security mail is not a notification preference. If this ever starts
    // being suppressed, opted-out users are locked out of their accounts.
    expect(sendMock).toHaveBeenCalled();
  });

  it('still delivers an OTP to a user who opted out', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', emailNotificationsEnabled: false });

    await service.sendOtpEmail('bo@example.com', '123456', 'LOGIN' as never);

    expect(sendMock).toHaveBeenCalled();
  });

  it('logs a successful send with its kind, for volume auditing', async () => {
    await service.sendPasswordResetEmail('bo@example.com', 'tok');

    expect(prisma.emailSendLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'sendPasswordResetEmail', sent: true }),
      }),
    );
  });

  it('never lets a logging failure break the email itself', async () => {
    prisma.emailSendLog.create.mockRejectedValue(new Error('db down'));

    await expect(service.sendPasswordResetEmail('bo@example.com', 'tok')).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalled();
  });
});
