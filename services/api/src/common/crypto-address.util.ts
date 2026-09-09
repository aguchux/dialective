import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Format sanity checks only (rejects an obviously wrong address like an
 * Ethereum 0x-address entered for a Tron wallet, or a typo), not a full
 * checksum decode. A trainer who enters a format-valid-but-wrong address is
 * still protected by the OTP confirmation step showing them the exact
 * address before it's saved and locked. Patterns match NOWPayments' own
 * wallet_regex per currency (confirmed live via GET /v1/full-currencies for
 * USDTTRC20/USDTERC20/USDTBSC/USDTSOL/USDTMATIC and the USDC equivalents on
 * 2026-09-09), so an address we accept is one NOWPayments will accept too.
 * ERC20/BEP20/POLYGON all share Ethereum's 0x-hex format since they're EVM
 * chains.
 */
const NETWORK_ADDRESS_PATTERNS: Record<string, RegExp> = {
  TRC20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ERC20: /^0x[0-9A-Fa-f]{40}$/,
  BEP20: /^0x[0-9A-Fa-f]{40}$/,
  POLYGON: /^0x[0-9A-Fa-f]{40}$/,
  SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};

export function isValidAddressForNetwork(address: unknown, network: unknown): boolean {
  if (typeof address !== 'string' || typeof network !== 'string') return false;
  const pattern = NETWORK_ADDRESS_PATTERNS[network.toUpperCase()];
  return pattern ? pattern.test(address) : false;
}

/**
 * Cross-field validator: reads the sibling network field named by
 * `networkProperty` off the same DTO instance to pick the right pattern --
 * a wallet address's validity depends on which network it's declared for,
 * so this can't be a standalone per-field decorator the way IsTronAddress
 * (single-network) was.
 */
export function IsCryptoAddress(networkProperty: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCryptoAddress',
      target: object.constructor,
      propertyName,
      constraints: [networkProperty],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const network = (args.object as Record<string, unknown>)[networkProperty];
          return isValidAddressForNetwork(value, network);
        },
        defaultMessage(args: ValidationArguments) {
          const network = (args.object as Record<string, unknown>)[networkProperty];
          return typeof network === 'string' && NETWORK_ADDRESS_PATTERNS[network.toUpperCase()]
            ? `Enter a valid ${network.toUpperCase()} wallet address.`
            : 'Enter a valid wallet address for the selected network.';
        },
      },
    });
  };
}
