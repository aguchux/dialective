'use client';

import { useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

type SmsProviderKey = 'termii' | 'twilio' | 'africastalking';
type SmsTransactionalProviderKey = 'termii' | 'twilio' | 'africastalking' | 'smslive247';

const PROVIDER_LABELS: Record<SmsTransactionalProviderKey, string> = {
  termii: 'Termii',
  twilio: 'Twilio',
  africastalking: "Africa's Talking",
  smslive247: 'SMSLive247',
};

const DEFAULT_ORDER: SmsProviderKey[] = ['termii', 'twilio', 'africastalking'];
const DEFAULT_TRANSACTIONAL_ORDER: SmsTransactionalProviderKey[] = [
  'smslive247',
  'termii',
  'twilio',
  'africastalking',
];

function parseOrder(csv: string): SmsProviderKey[] {
  const parts = csv.split(',').map((part) => part.trim()) as SmsProviderKey[];
  const isValid =
    parts.length === DEFAULT_ORDER.length &&
    DEFAULT_ORDER.every((key) => parts.includes(key)) &&
    new Set(parts).size === DEFAULT_ORDER.length;
  return isValid ? parts : DEFAULT_ORDER;
}

function parseTransactionalOrder(csv: string): SmsTransactionalProviderKey[] {
  const parts = csv.split(',').map((part) => part.trim()) as SmsTransactionalProviderKey[];
  const isValid =
    parts.length === DEFAULT_TRANSACTIONAL_ORDER.length &&
    DEFAULT_TRANSACTIONAL_ORDER.every((key) => parts.includes(key)) &&
    new Set(parts).size === DEFAULT_TRANSACTIONAL_ORDER.length;
  return isValid ? parts : DEFAULT_TRANSACTIONAL_ORDER;
}

export function SmsSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [smsSenderId, setSmsSenderId] = useState('');
  const [order, setOrder] = useState<SmsProviderKey[]>(DEFAULT_ORDER);
  const [smslive247NativeOtpEnabled, setSmslive247NativeOtpEnabled] = useState(false);
  const [smsTransactionalOtpEnabled, setSmsTransactionalOtpEnabled] = useState(true);
  const [transactionalOrder, setTransactionalOrder] = useState<SmsTransactionalProviderKey[]>(
    DEFAULT_TRANSACTIONAL_ORDER,
  );
  const [p2pSmsTradeCreatedEnabled, setP2pSmsTradeCreatedEnabled] = useState(false);
  const [p2pSmsPaymentMarkedEnabled, setP2pSmsPaymentMarkedEnabled] = useState(false);
  const [p2pSmsTokensReleasedEnabled, setP2pSmsTokensReleasedEnabled] = useState(false);
  const [p2pSmsCancelledEnabled, setP2pSmsCancelledEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setSmsSenderId(settings.smsSenderId ?? '');
    setOrder(parseOrder(settings.smsProviderOrder));
    setSmslive247NativeOtpEnabled(settings.smslive247NativeOtpEnabled);
    setSmsTransactionalOtpEnabled(settings.smsTransactionalOtpEnabled);
    setTransactionalOrder(parseTransactionalOrder(settings.smsTransactionalProviderOrder));
    setP2pSmsTradeCreatedEnabled(settings.p2pSmsTradeCreatedEnabled);
    setP2pSmsPaymentMarkedEnabled(settings.p2pSmsPaymentMarkedEnabled);
    setP2pSmsTokensReleasedEnabled(settings.p2pSmsTokensReleasedEnabled);
    setP2pSmsCancelledEnabled(settings.p2pSmsCancelledEnabled);
  }, [settings]);

  function setChoice(position: 0 | 1 | 2, provider: SmsProviderKey) {
    setOrder((current) => {
      const next = [...current] as SmsProviderKey[];
      next[position] = provider;
      return next;
    });
  }

  function setTransactionalChoice(position: 0 | 1 | 2 | 3, provider: SmsTransactionalProviderKey) {
    setTransactionalOrder((current) => {
      const next = [...current] as SmsTransactionalProviderKey[];
      next[position] = provider;
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (new Set(order).size !== DEFAULT_ORDER.length) {
      setError('Each OTP provider choice must be distinct.');
      return;
    }
    if (new Set(transactionalOrder).size !== DEFAULT_TRANSACTIONAL_ORDER.length) {
      setError('Each transactional provider choice must be distinct.');
      return;
    }

    try {
      await updateSettings({
        smsSenderId: smsSenderId.trim(),
        smsProviderOrder: order.join(','),
        smslive247NativeOtpEnabled,
        smsTransactionalOtpEnabled,
        smsTransactionalProviderOrder: transactionalOrder.join(','),
        p2pSmsTradeCreatedEnabled,
        p2pSmsPaymentMarkedEnabled,
        p2pSmsTokensReleasedEnabled,
        p2pSmsCancelledEnabled,
      }).unwrap();
      setMessage('SMS provider settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save SMS provider settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">SMS Providers</h2>
        <p className="leading-relaxed text-muted">
          Delivers phone-verification codes (Profile &gt; Phone number, required before payment
          methods or P2P trading).
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-5 md:max-w-md" onSubmit={handleSave}>
          <div className="grid gap-2">
            <label className="font-bold" htmlFor="sms-sender-id">
              Sender ID
            </label>
            <p className="text-sm leading-relaxed text-muted">
              The name shown to recipients as the SMS sender (e.g. &quot;Dialect&quot;), used by
              Termii, SMSLive247, and Africa&apos;s Talking, including SMSLive247&apos;s native OTP
              flow below. Twilio ignores this -- it sends from a purchased phone number instead.
              Leave blank to use each provider&apos;s configured default.
            </p>
            <input
              className={`${inputClass} max-w-60`}
              id="sms-sender-id"
              maxLength={20}
              onChange={(e) => setSmsSenderId(e.target.value)}
              placeholder="e.g. Dialect"
              type="text"
              value={smsSenderId}
            />
          </div>

          <div className="grid gap-2">
            <span className="font-bold">Provider order (fallback chain)</span>
            <p className="text-sm leading-relaxed text-muted">
              1st choice is tried first; the rest are only used if the ones before them fail. All
              three must be distinct. Used only when the SMSLive247 native OTP flow below is off.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {(['1st choice', '2nd choice', '3rd choice'] as const).map((label, index) => (
                <div className="grid gap-1" key={label}>
                  <label className="text-sm font-bold" htmlFor={`sms-order-${index}`}>
                    {label}
                  </label>
                  <select
                    className={inputClass}
                    id={`sms-order-${index}`}
                    value={order[index]}
                    onChange={(e) =>
                      setChoice(index as 0 | 1 | 2, e.target.value as SmsProviderKey)
                    }
                  >
                    {DEFAULT_ORDER.map((key) => (
                      <option key={key} value={key}>
                        {PROVIDER_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="sms-transactional-otp-enabled"
            >
              <input
                checked={smsTransactionalOtpEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="sms-transactional-otp-enabled"
                onChange={(event) => setSmsTransactionalOtpEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Send OTP through transactional SMS</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Uses the transactional provider order below, with SMSLive247 first. The message
                  is the six-digit code only, for example 908822. The platform still controls OTP
                  expiry and verification. Turn this off only to use the legacy OTP chain or
                  SMSLive247&apos;s native token flow.
                </span>
              </span>
            </label>
          </div>

          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="smslive247-native-otp-enabled"
            >
              <input
                checked={smslive247NativeOtpEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="smslive247-native-otp-enabled"
                onChange={(event) => setSmslive247NativeOtpEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Use SMSLive247&apos;s native OTP flow</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When transactional OTP above is off, phone verification bypasses the legacy
                  fallback chain entirely and uses SMSLive247&apos;s own
                  token-generate/verify API end-to-end -- SMSLive247 generates and checks the code
                  on their side, not ours.
                </span>
              </span>
            </label>
          </div>

          <div className="border-t border-line pt-5">
            <h3 className="text-lg font-black">Transactional SMS provider order</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Used for P2P trade notifications and, when enabled above, direct-code OTP delivery.
            </p>
          </div>

          <div className="grid gap-2">
            <span className="font-bold">Provider order (fallback chain)</span>
            <p className="text-sm leading-relaxed text-muted">
              1st choice is tried first; the rest are only used if the ones before them fail. All
              four must be distinct.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['1st choice', '2nd choice', '3rd choice', '4th choice'] as const).map(
                (label, index) => (
                  <div className="grid gap-1" key={label}>
                    <label
                      className="text-sm font-bold"
                      htmlFor={`sms-transactional-order-${index}`}
                    >
                      {label}
                    </label>
                    <select
                      className={inputClass}
                      id={`sms-transactional-order-${index}`}
                      value={transactionalOrder[index]}
                      onChange={(e) =>
                        setTransactionalChoice(
                          index as 0 | 1 | 2 | 3,
                          e.target.value as SmsTransactionalProviderKey,
                        )
                      }
                    >
                      {DEFAULT_TRANSACTIONAL_ORDER.map((key) => (
                        <option key={key} value={key}>
                          {PROVIDER_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="font-bold">Notification events</span>
            <p className="text-sm leading-relaxed text-muted">
              Each event below is independently on/off.
            </p>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-3"
              htmlFor="p2p-sms-trade-created"
            >
              <input
                checked={p2pSmsTradeCreatedEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="p2p-sms-trade-created"
                onChange={(event) => setP2pSmsTradeCreatedEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Trade created</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  SMS both buyer and seller when a P2P trade starts, with the payment deadline.
                </span>
              </span>
            </label>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-3"
              htmlFor="p2p-sms-payment-marked"
            >
              <input
                checked={p2pSmsPaymentMarkedEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="p2p-sms-payment-marked"
                onChange={(event) => setP2pSmsPaymentMarkedEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Buyer marked paid</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  SMS the seller when the buyer marks a trade as paid, so they can confirm and
                  release DL.
                </span>
              </span>
            </label>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-3"
              htmlFor="p2p-sms-tokens-released"
            >
              <input
                checked={p2pSmsTokensReleasedEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="p2p-sms-tokens-released"
                onChange={(event) => setP2pSmsTokensReleasedEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">DL released</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  SMS the buyer when the seller releases DL and the trade completes.
                </span>
              </span>
            </label>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-3"
              htmlFor="p2p-sms-cancelled"
            >
              <input
                checked={p2pSmsCancelledEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="p2p-sms-cancelled"
                onChange={(event) => setP2pSmsCancelledEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Cancelled / expired / dispute</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  SMS the seller when a trade is cancelled, expires, or a dispute resolves in their
                  favor, and SMS the other party when a dispute is raised.
                </span>
              </span>
            </label>
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save SMS provider settings
            </ActionButton>
          </div>
        </form>
      )}

      {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
