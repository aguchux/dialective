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
