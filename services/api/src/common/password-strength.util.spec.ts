import { validate } from 'class-validator';
import { isStrongPassword, IsStrongPassword, PASSWORD_MIN_LENGTH } from './password-strength.util';

class TestDto {
  @IsStrongPassword()
  password!: string;
}

describe('isStrongPassword', () => {
  it('rejects an all-lowercase-alphabetic password regardless of length', () => {
    expect(isStrongPassword('chinecherem')).toBe(false);
  });

  it('rejects a capitalized-only alphabetic password with no digit', () => {
    // The exact case reported: "Chinecherem" -- 11 letters, one uppercase, no digit.
    expect(isStrongPassword('Chinecherem')).toBe(false);
  });

  it('rejects a password shorter than the minimum length even with all character classes', () => {
    expect(isStrongPassword('Ab1defgh')).toBe(false); // 8 chars, below PASSWORD_MIN_LENGTH
  });

  it('rejects a password with no uppercase letter', () => {
    expect(isStrongPassword('lowercase123456')).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(isStrongPassword('NoDigitsHerePlease')).toBe(false);
  });

  it('accepts a password meeting length + all three character classes', () => {
    expect(isStrongPassword('Chinecherem1')).toBe(true);
  });

  it('does not require a symbol', () => {
    expect(isStrongPassword('AllLettersAndDigits123')).toBe(true);
  });

  it('rejects a non-string value', () => {
    expect(isStrongPassword(12345678901234 as unknown as string)).toBe(false);
  });

  it(`PASSWORD_MIN_LENGTH is ${PASSWORD_MIN_LENGTH}`, () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });
});

describe('IsStrongPassword decorator', () => {
  it('fails class-validator validation for a weak password', async () => {
    const dto = new TestDto();
    dto.password = 'Chinecherem';
    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isStrongPassword');
  });

  it('passes class-validator validation for a strong password', async () => {
    const dto = new TestDto();
    dto.password = 'Chinecherem1';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
