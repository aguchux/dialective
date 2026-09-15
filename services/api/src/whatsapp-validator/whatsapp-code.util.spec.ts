import { generateWhatsAppCode } from './whatsapp-code.util';
import { hashOtpCode } from '../otp/otp.util';

describe('generateWhatsAppCode', () => {
  it('generates a 6-char uppercase alphanumeric code', () => {
    const { code } = generateWhatsAppCode();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('excludes ambiguous characters (0/O, 1/I/L)', () => {
    for (let i = 0; i < 200; i += 1) {
      const { code } = generateWhatsAppCode();
      expect(code).not.toMatch(/[01IOL]/);
    }
  });

  it('returns a hash matching hashOtpCode(code)', () => {
    const { code, hash } = generateWhatsAppCode();
    expect(hash).toBe(hashOtpCode(code));
  });

  it('generates different codes across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateWhatsAppCode().code));
    expect(codes.size).toBeGreaterThan(1);
  });
});
