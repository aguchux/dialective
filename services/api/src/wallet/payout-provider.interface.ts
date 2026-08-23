/**
 * Shared surface between NowPaymentsService and FlutterwaveService, scoped
 * to what genuinely has the same shape across both: polling a previously
 * created payout for its current status. create/verify/resolve methods
 * stay provider-specific (crypto address+network vs. bank/mobile+country
 * are not the same shape, and every call site already branches explicitly
 * on payoutMethod/provider before choosing which service to call) -- see
 * docs/Tokenomics-Fiat-Engine.md §4.
 */
export interface ProviderPayoutStatus {
  payoutId: string;
  status: string | null;
  raw: Record<string, unknown>;
}

export interface PayoutProvider {
  getPayoutStatus(payoutId: string): Promise<ProviderPayoutStatus>;
}
