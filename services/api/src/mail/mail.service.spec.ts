const sendMock = jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import { MailService } from './mail.service';

describe('MailService.sendWeeklyTrainerReportEmail', () => {
  let settings: any;
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = { getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com') };
    service = new MailService(settings as never);
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

describe('MailService.sendOtpEmail PAYOUT_ACCOUNT_DELETE', () => {
  let settings: any;
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = { getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com') };
    service = new MailService(settings as never);
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
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = { getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com') };
    service = new MailService(settings as never);
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
  let service: MailService;

  beforeEach(() => {
    sendMock.mockClear();
    process.env.RESEND_API_KEY = 'test-key';
    settings = {
      getResendFromAddress: jest.fn().mockResolvedValue('noreply@example.com'),
      getLeadsNotificationAddress: jest.fn().mockResolvedValue('support@example.com'),
    };
    service = new MailService(settings as never);
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
