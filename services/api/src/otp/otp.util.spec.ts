import { resolveOtpDestination } from './otp.util';

function settings(otpChannel: string, whatsappEnabled: boolean) {
  return {
    getOtpChannel: jest.fn().mockResolvedValue(otpChannel),
    isWhatsappOtpEnabled: jest.fn().mockResolvedValue(whatsappEnabled),
  };
}

describe('resolveOtpDestination', () => {
  it('returns EMAIL when the user has no verified phone number', async () => {
    const result = await resolveOtpDestination(
      { email: 'trainer@example.com', phoneNumber: null, phoneVerifiedAt: null },
      settings('whatsapp', true),
    );

    expect(result).toEqual({ destination: 'trainer@example.com', channel: 'EMAIL' });
  });

  it('returns EMAIL when the phone number exists but is unverified', async () => {
    const result = await resolveOtpDestination(
      { email: 'trainer@example.com', phoneNumber: '+15551234567', phoneVerifiedAt: null },
      settings('whatsapp', true),
    );

    expect(result).toEqual({ destination: 'trainer@example.com', channel: 'EMAIL' });
  });

  it('returns SMS for a verified phone when otpChannel is "sms"', async () => {
    const result = await resolveOtpDestination(
      { email: 'trainer@example.com', phoneNumber: '+15551234567', phoneVerifiedAt: new Date() },
      settings('sms', false),
    );

    expect(result).toEqual({ destination: '+15551234567', channel: 'SMS' });
  });

  it('returns WHATSAPP for a verified phone when otpChannel is "whatsapp" and whatsappOtpEnabled is true', async () => {
    const result = await resolveOtpDestination(
      { email: 'trainer@example.com', phoneNumber: '+15551234567', phoneVerifiedAt: new Date() },
      settings('whatsapp', true),
    );

    expect(result).toEqual({ destination: '+15551234567', channel: 'WHATSAPP' });
  });

  it('falls back to SMS when otpChannel is "whatsapp" but whatsappOtpEnabled is false', async () => {
    // An admin picking "whatsapp" without finishing MailerSend setup (or
    // deliberately disabling it later) must never silently break OTP
    // delivery -- see resolveOtpDestination's doc comment.
    const result = await resolveOtpDestination(
      { email: 'trainer@example.com', phoneNumber: '+15551234567', phoneVerifiedAt: new Date() },
      settings('whatsapp', false),
    );

    expect(result).toEqual({ destination: '+15551234567', channel: 'SMS' });
  });
});
