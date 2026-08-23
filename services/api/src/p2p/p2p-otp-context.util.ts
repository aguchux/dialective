import { hashContext } from '../otp/otp.util';
import { RequestPaymentMethodOtpDto, UpsertPaymentMethodDto } from './dto/p2p.dto';

export function paymentMethodContextHash(
  input: (RequestPaymentMethodOtpDto | UpsertPaymentMethodDto) & { id?: string },
): string {
  return hashContext({
    id: input.id ?? '',
    methodType: normalized(input.methodType).toUpperCase(),
    fiatCurrency: normalized(input.fiatCurrency).toUpperCase(),
    bankCode: normalized(input.bankCode),
    accountNumber: normalized(input.accountNumber),
    enabled: String(input.enabled ?? true),
  });
}

function normalized(value?: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '';
}
