import { hashContext } from '../otp/otp.util';
import { RequestPaymentMethodOtpDto, UpsertPaymentMethodDto } from './dto/p2p.dto';

export function paymentMethodContextHash(
  input: (RequestPaymentMethodOtpDto | UpsertPaymentMethodDto) & { id?: string },
): string {
  return hashContext({
    id: input.id ?? '',
    label: normalized(input.label),
    methodType: normalized(input.methodType).toUpperCase(),
    fiatCurrency: normalized(input.fiatCurrency).toUpperCase(),
    bankName: normalized(input.bankName),
    accountName: normalized(input.accountName),
    accountNumber: normalized(input.accountNumber),
    instructions: normalized(input.instructions),
    enabled: String(input.enabled ?? true),
  });
}

function normalized(value?: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '';
}
