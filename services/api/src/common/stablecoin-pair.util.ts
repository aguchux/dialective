import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { isValidStablecoinPair } from '../wallet/stablecoin-networks';

/**
 * Not every network supports every stablecoin on NOWPayments -- e.g. USDC
 * has no Tron listing at all for this merchant account (see
 * wallet/stablecoin-networks.ts) -- so a network that's individually
 * @IsIn-valid can still be an invalid pairing with the chosen asset. Reads
 * the sibling asset field named by `assetProperty` off the same DTO
 * instance, the same cross-field pattern as IsCryptoAddress.
 */
export function IsValidStablecoinPair(
  assetProperty: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidStablecoinPair',
      target: object.constructor,
      propertyName,
      constraints: [assetProperty],
      options: validationOptions,
      validator: {
        validate(network: unknown, args: ValidationArguments) {
          const asset = (args.object as Record<string, unknown>)[assetProperty];
          return typeof asset === 'string' && typeof network === 'string'
            ? isValidStablecoinPair(asset, network)
            : false;
        },
        defaultMessage(args: ValidationArguments) {
          const asset = (args.object as Record<string, unknown>)[assetProperty];
          return `${asset} is not available on this network.`;
        },
      },
    });
  };
}
