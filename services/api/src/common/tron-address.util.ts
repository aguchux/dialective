import { registerDecorator, ValidationOptions } from 'class-validator';

// Tron mainnet addresses are base58check-encoded, always start with 'T', and
// are always exactly 34 characters -- this is a format sanity check only
// (rejects obviously wrong input like an Ethereum 0x-address or a typo), not
// a full base58check checksum decode. A trainer who enters a
// format-valid-but-wrong address is still protected by the OTP confirmation
// step showing them the exact address before it's saved and locked.
const TRON_ADDRESS_PATTERN = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isTronAddress(value: unknown): value is string {
  return typeof value === 'string' && TRON_ADDRESS_PATTERN.test(value);
}

export function IsTronAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTronAddress',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isTronAddress(value);
        },
        defaultMessage() {
          return 'Enter a valid TRC20 (Tron) wallet address -- it must start with "T" and be 34 characters long.';
        },
      },
    });
  };
}
