'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetAdminP2PSettingsQuery,
  useUpdateAdminP2PSettingsMutation,
} from '@/store/api';

export function P2PMarketSettingsPanel() {
  const { data: settings, isLoading } = useGetAdminP2PSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateAdminP2PSettingsMutation();
  const [form, setForm] = useState({
    enabled: false,
    sellOffersEnabled: false,
    buyRequestsEnabled: false,
    minTradeTokens: '1',
    maxTradeTokens: '1000',
    paymentWindowMinutes: 15,
    cancelGraceMinutes: 5,
    offerExpiryMinutes: 1440,
    maxOpenOffersPerUser: 5,
    maxOpenTradesPerUser: 3,
    allowedFiatCurrencies: 'NGN',
    allowedPaymentMethods: 'BANK_TRANSFER',
    disputeWindowMinutes: 1440,
    adminOtpRequiredForDisputes: true,
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!settings) return;
    setForm({
      enabled: settings.enabled,
      sellOffersEnabled: settings.sellOffersEnabled,
      buyRequestsEnabled: settings.buyRequestsEnabled,
      minTradeTokens: settings.minTradeTokens,
      maxTradeTokens: settings.maxTradeTokens,
      paymentWindowMinutes: settings.paymentWindowMinutes,
      cancelGraceMinutes: settings.cancelGraceMinutes,
      offerExpiryMinutes: settings.offerExpiryMinutes,
      maxOpenOffersPerUser: settings.maxOpenOffersPerUser,
      maxOpenTradesPerUser: settings.maxOpenTradesPerUser,
      allowedFiatCurrencies: settings.allowedFiatCurrencies,
      allowedPaymentMethods: settings.allowedPaymentMethods,
      disputeWindowMinutes: settings.disputeWindowMinutes,
      adminOtpRequiredForDisputes: settings.adminOtpRequiredForDisputes,
    });
  }, [settings]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      await updateSettings({
        ...form,
        minTradeTokens: Number(form.minTradeTokens) as never,
        maxTradeTokens: Number(form.maxTradeTokens) as never,
      }).unwrap();
      setMessage('P2P market settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save P2P settings'));
    }
  }

  if (isLoading)
    return <section className="rounded-lg border border-line bg-white p-5">Loading...</section>;

  return (
    <form className="grid gap-5 rounded-lg border border-line bg-white p-5" onSubmit={submit}>
      <div>
        <h2 className="text-xl font-black">P2P Escrow Market</h2>
        <p className="mt-1 text-sm text-muted">
          Gate marketplace access, trade limits, countdowns, cancellation grace, and dispute
          settings.
        </p>
      </div>
      {message && (
        <p className="rounded-lg bg-green-50 p-3 text-sm font-bold text-green-700">{message}</p>
      )}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle
          label="Enable P2P market"
          value={form.enabled}
          onChange={(enabled) => setForm((current) => ({ ...current, enabled }))}
        />
        <Toggle
          label="Enable sell offers"
          value={form.sellOffersEnabled}
          onChange={(sellOffersEnabled) =>
            setForm((current) => ({ ...current, sellOffersEnabled }))
          }
        />
        <Toggle
          label="Enable buy requests"
          value={form.buyRequestsEnabled}
          onChange={(buyRequestsEnabled) =>
            setForm((current) => ({ ...current, buyRequestsEnabled }))
          }
        />
        <Toggle
          label="Require admin OTP for disputes"
          value={form.adminOtpRequiredForDisputes}
          onChange={(adminOtpRequiredForDisputes) =>
            setForm((current) => ({ ...current, adminOtpRequiredForDisputes }))
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Min trade DL"
          value={form.minTradeTokens}
          onChange={(minTradeTokens) => setForm((current) => ({ ...current, minTradeTokens }))}
        />
        <Field
          label="Max trade DL"
          value={form.maxTradeTokens}
          onChange={(maxTradeTokens) => setForm((current) => ({ ...current, maxTradeTokens }))}
        />
        <NumberField
          label="Payment window minutes"
          value={form.paymentWindowMinutes}
          onChange={(paymentWindowMinutes) =>
            setForm((current) => ({ ...current, paymentWindowMinutes }))
          }
        />
        <NumberField
          label="Cancel grace minutes"
          value={form.cancelGraceMinutes}
          onChange={(cancelGraceMinutes) =>
            setForm((current) => ({ ...current, cancelGraceMinutes }))
          }
        />
        <NumberField
          label="Offer expiry minutes"
          value={form.offerExpiryMinutes}
          onChange={(offerExpiryMinutes) =>
            setForm((current) => ({ ...current, offerExpiryMinutes }))
          }
        />
        <NumberField
          label="Max open offers/user"
          value={form.maxOpenOffersPerUser}
          onChange={(maxOpenOffersPerUser) =>
            setForm((current) => ({ ...current, maxOpenOffersPerUser }))
          }
        />
        <NumberField
          label="Max open trades/user"
          value={form.maxOpenTradesPerUser}
          onChange={(maxOpenTradesPerUser) =>
            setForm((current) => ({ ...current, maxOpenTradesPerUser }))
          }
        />
        <Field
          label="Allowed fiat currencies"
          value={form.allowedFiatCurrencies}
          onChange={(allowedFiatCurrencies) =>
            setForm((current) => ({ ...current, allowedFiatCurrencies }))
          }
        />
        <Field
          label="Allowed payment methods"
          value={form.allowedPaymentMethods}
          onChange={(allowedPaymentMethods) =>
            setForm((current) => ({ ...current, allowedPaymentMethods }))
          }
        />
      </div>

      <button
        className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white disabled:opacity-60"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? 'Saving...' : 'Save P2P settings'}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold">
      {label}
      <input
        className="min-h-11 rounded-lg border border-line bg-surface px-3 font-normal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-bold">
      {label}
      <input
        className="min-h-11 rounded-lg border border-line bg-surface px-3 font-normal"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-3 text-sm font-bold">
      {label}
      <input
        checked={value}
        className="size-5 accent-[#6F16B9]"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
