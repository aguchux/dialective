import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Minimum length + character-class requirements only -- no symbol required.
 * NIST 800-63B leans toward length over composition complexity; requiring a
 * symbol adds real user friction for limited real-world strength gain once
 * length + mixed case + a digit are already required. Breached-password
 * checking (HaveIBeenPwned) is a deliberate follow-up, not part of this
 * decorator -- that needs an async network call this sync class-validator
 * decorator can't make.
 */
export const PASSWORD_MIN_LENGTH = 12;

const HAS_UPPERCASE = /[A-Z]/;
const HAS_LOWERCASE = /[a-z]/;
const HAS_DIGIT = /[0-9]/;

export function isStrongPassword(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return (
    value.length >= PASSWORD_MIN_LENGTH &&
    HAS_UPPERCASE.test(value) &&
    HAS_LOWERCASE.test(value) &&
    HAS_DIGIT.test(value)
  );
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isStrongPassword(value);
        },
        defaultMessage() {
          return (
            `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include ` +
            'an uppercase letter, a lowercase letter, and a digit.'
          );
        },
      },
    });
  };
}
