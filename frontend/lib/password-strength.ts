// Mirrors services/api/src/common/password-strength.util.ts's isStrongPassword
// exactly -- keep both in lockstep so the client never shows "looks good"
// for something the server will reject. No entropy/zxcvbn scoring
// deliberately -- length + character-class requirements are what the
// server actually enforces, so that's what the UI reflects.
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordRequirement {
  key: string;
  label: string;
  met: boolean;
}

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      key: 'length',
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { key: 'uppercase', label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { key: 'lowercase', label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { key: 'digit', label: 'One digit', met: /[0-9]/.test(password) },
  ];
}

export function isStrongPassword(password: string): boolean {
  return getPasswordRequirements(password).every((requirement) => requirement.met);
}
