/**
 * Starter payment-method catalog for the countries FLUTTERWAVE_COUNTRIES
 * (frontend/app/dashboard/payout-accounts/page.tsx) already supports for
 * live bank resolution. This seed only covers a handful of well-known
 * banks/mobile-money providers per country to give the catalog real
 * content on day one -- admins add/edit/reorder/disable entries afterward
 * via /admin/payment-methods (PaymentMethodsService), this file is not
 * re-synced automatically like Integration's registry is.
 */
export interface PaymentMethodCatalogSeed {
  countryCode: string;
  type: 'BANK' | 'MOBILE_MONEY';
  name: string;
  bankCode?: string;
  sortOrder: number;
}

export const PAYMENT_METHOD_CATALOG_SEED: PaymentMethodCatalogSeed[] = [
  // Nigeria
  { countryCode: 'NG', type: 'BANK', name: 'Access Bank', bankCode: '044', sortOrder: 0 },
  { countryCode: 'NG', type: 'BANK', name: 'GTBank', bankCode: '058', sortOrder: 1 },
  { countryCode: 'NG', type: 'BANK', name: 'Zenith Bank', bankCode: '057', sortOrder: 2 },
  { countryCode: 'NG', type: 'BANK', name: 'First Bank of Nigeria', bankCode: '011', sortOrder: 3 },
  { countryCode: 'NG', type: 'BANK', name: 'UBA', bankCode: '033', sortOrder: 4 },
  { countryCode: 'NG', type: 'MOBILE_MONEY', name: 'Opay', sortOrder: 5 },
  { countryCode: 'NG', type: 'MOBILE_MONEY', name: 'Palmpay', sortOrder: 6 },

  // Ghana
  { countryCode: 'GH', type: 'BANK', name: 'GCB Bank', sortOrder: 0 },
  { countryCode: 'GH', type: 'BANK', name: 'Ecobank Ghana', sortOrder: 1 },
  { countryCode: 'GH', type: 'MOBILE_MONEY', name: 'MTN Mobile Money', sortOrder: 2 },
  { countryCode: 'GH', type: 'MOBILE_MONEY', name: 'AirtelTigo Money', sortOrder: 3 },
  { countryCode: 'GH', type: 'MOBILE_MONEY', name: 'Vodafone Cash', sortOrder: 4 },

  // Kenya
  { countryCode: 'KE', type: 'BANK', name: 'Equity Bank', sortOrder: 0 },
  { countryCode: 'KE', type: 'BANK', name: 'KCB Bank', sortOrder: 1 },
  { countryCode: 'KE', type: 'BANK', name: 'Co-operative Bank of Kenya', sortOrder: 2 },
  { countryCode: 'KE', type: 'MOBILE_MONEY', name: 'M-Pesa', sortOrder: 3 },
  { countryCode: 'KE', type: 'MOBILE_MONEY', name: 'Airtel Money', sortOrder: 4 },

  // Uganda
  { countryCode: 'UG', type: 'BANK', name: 'Stanbic Bank Uganda', sortOrder: 0 },
  { countryCode: 'UG', type: 'BANK', name: 'Centenary Bank', sortOrder: 1 },
  { countryCode: 'UG', type: 'MOBILE_MONEY', name: 'MTN Mobile Money', sortOrder: 2 },
  { countryCode: 'UG', type: 'MOBILE_MONEY', name: 'Airtel Money', sortOrder: 3 },

  // South Africa
  { countryCode: 'ZA', type: 'BANK', name: 'Standard Bank', sortOrder: 0 },
  { countryCode: 'ZA', type: 'BANK', name: 'FNB', sortOrder: 1 },
  { countryCode: 'ZA', type: 'BANK', name: 'Absa', sortOrder: 2 },
  { countryCode: 'ZA', type: 'BANK', name: 'Nedbank', sortOrder: 3 },

  // Tanzania
  { countryCode: 'TZ', type: 'BANK', name: 'CRDB Bank', sortOrder: 0 },
  { countryCode: 'TZ', type: 'BANK', name: 'NMB Bank', sortOrder: 1 },
  { countryCode: 'TZ', type: 'MOBILE_MONEY', name: 'M-Pesa', sortOrder: 2 },
  { countryCode: 'TZ', type: 'MOBILE_MONEY', name: 'Tigo Pesa', sortOrder: 3 },
  { countryCode: 'TZ', type: 'MOBILE_MONEY', name: 'Airtel Money', sortOrder: 4 },
];
